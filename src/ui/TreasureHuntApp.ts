import { ProximityFeedback } from "../audio/ProximityFeedback";
import { createRoomService } from "../network/createRoomService";
import type { RoomService } from "../network/RoomService";
import { DeviceSensors, DeadReckoningTracker, type CompassState } from "../sensors/DeviceSensors";
import { HIDING_SECONDS, MAX_KEYS, MIN_KEYS, PHASE_LABELS, READY_COUNTDOWN_SECONDS, SEEKING_SECONDS } from "../simulation/constants";
import { bearingTo, clamp, horizontalDistance, proximityPercent, relativeDirectionLabel, signedAngleDelta } from "../simulation/math";
import {
  bothPlayersReady,
  buildHidingPatch,
  buildSeekingPatch,
  formatClock,
  getActiveKey,
  getPhaseAfterReady,
  getRemainingMs,
  isHidingComplete,
  isValidKeyCount
} from "../simulation/rules";
import { ScanEstimator } from "../simulation/scan";
import type { PlayerRole, RoomState, TreasureKey, Vector3 } from "../simulation/types";
import { ARRenderer, type XRStatus } from "../xr/ARRenderer";

type SetupView = "home" | "hider-setup" | "seeker-join";

interface GuidanceState {
  targetLabel: string;
  distance: number;
  proximity: number;
  delta: number;
  directionLabel: string;
}

const ZERO: Vector3 = { x: 0, y: 0, z: 0 };

export class TreasureHuntApp {
  private readonly service: RoomService = createRoomService();
  private readonly sensors = new DeviceSensors();
  private readonly tracker = new DeadReckoningTracker();
  private readonly xr = new ARRenderer();
  private readonly feedback = new ProximityFeedback();
  private readonly scanEstimator = new ScanEstimator();

  private setupView: SetupView = "home";
  private selectedKeyCount = 1;
  private joinCode = "";
  private lastMarkedKeyIndex: number | null = null;
  private room: RoomState | null = null;
  private role: PlayerRole | null = null;
  private error = "";
  private notice = "";
  private mediaReady = false;
  private cameraStream: MediaStream | null = null;
  private compass: CompassState = { heading: 0, pitch: 0, supported: false };
  private xrStatus: XRStatus = {
    supported: false,
    active: false,
    mode: "fallback",
    message: "AR durumu kontrol ediliyor."
  };
  private scanProgress = 0;
  private unsubscribeRoom: (() => void) | null = null;
  private unsubscribeCompass: (() => void) | null = null;
  private tickHandle: number | null = null;
  private rendering = false;

  constructor(private readonly root: HTMLElement) {}

  start(): void {
    this.unsubscribeCompass = this.sensors.onCompass((state) => {
      this.compass = state;
      this.tracker.setHeading(state.heading);
    });

    void this.xr.getStatus().then((status) => {
      this.xrStatus = status;
      this.render();
    });

    this.tickHandle = window.setInterval(() => this.tick(), 500);
    this.installDebugHooks();
    this.render();
  }

  private tick(): void {
    if (this.room?.phase === "scanning" && this.role === "hider" && this.mediaReady) {
      const progress = this.compass.supported
        ? this.scanEstimator.addSample({
            heading: this.compass.heading,
            pitch: this.compass.pitch,
            timestamp: performance.now()
          })
        : this.scanEstimator.getProgress();

      if (progress.progress !== this.scanProgress) {
        this.scanProgress = progress.progress;
        this.render();
      }
    }

    if (this.room?.phase === "seeking" && getRemainingMs(this.room.seekEndsAt) === 0 && !this.room.winner) {
      void this.service.updateRoom(this.room.id, { phase: "finished", winner: "hider" });
      return;
    }

    if (this.room?.phase === "treasure" && this.role === "seeker") {
      const guidance = this.getGuidance();
      this.feedback.setProximity(guidance?.proximity ?? 0);
      this.feedback.pulseNow(guidance?.proximity ?? 0);
    }

    if (this.room?.phase === "hiding" || this.room?.phase === "seeking" || this.room?.phase === "treasure") {
      this.render();
    }
  }

  private render(): void {
    if (this.rendering) {
      return;
    }

    this.rendering = true;
    const html = this.room ? this.renderRoom() : this.renderSetup();
    this.root.innerHTML = html;
    this.bindEvents();
    this.attachCameraPreview();
    this.mountXRCanvas();
    this.rendering = false;
  }

  private renderSetup(): string {
    if (this.setupView === "hider-setup") {
      return this.shell(`
        <section class="panel setup-panel">
          <button class="ghost-button top-left" data-action="back">Geri</button>
          <p class="eyebrow">Saklayan Paneli</p>
          <h1>Anahtarları seç</h1>
          <div class="key-counter" aria-live="polite">
            <span>Anahtar Sayısı</span>
            <strong>${this.selectedKeyCount} / ${MAX_KEYS}</strong>
          </div>
          <div class="stepper" aria-label="Anahtar sayısı">
            <button data-action="decrease-keys" ${this.selectedKeyCount <= MIN_KEYS ? "disabled" : ""}>-</button>
            <span>${this.selectedKeyCount}</span>
            <button data-action="increase-keys" ${this.selectedKeyCount >= MAX_KEYS ? "disabled" : ""}>+</button>
          </div>
          <button class="primary-button" data-action="create-room" ${isValidKeyCount(this.selectedKeyCount) ? "" : "disabled"}>
            Oyunu Kur
          </button>
        </section>
      `);
    }

    if (this.setupView === "seeker-join") {
      return this.shell(`
        <section class="panel setup-panel">
          <button class="ghost-button top-left" data-action="back">Geri</button>
          <p class="eyebrow">Bulan Paneli</p>
          <h1>Oda kodunu gir</h1>
          <input id="join-code" class="code-input" maxlength="3" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(this.joinCode)}" placeholder="123" autocomplete="one-time-code" />
          <button class="primary-button" data-action="join-room" ${this.joinCode.trim().length === 3 ? "" : "disabled"}>
            Oyuna Katıl
          </button>
        </section>
      `);
    }

    return this.shell(`
      <section class="hero">
        <div>
          <p class="eyebrow">Mobil AR Saklambaç</p>
          <h1>Treasure Hunt</h1>
          <p class="subcopy">İki telefon, kamera, pusula ve yakınlık hissiyle ev içinde oynanan dedektif oyunu.</p>
        </div>
        <div class="role-grid">
          <button class="role-button hider" data-action="choose-hider">
            <span>Saklayan</span>
            <small>Odayı kur, anahtarları gizle</small>
          </button>
          <button class="role-button seeker" data-action="choose-seeker">
            <span>Bulan</span>
            <small>Kodla katıl, hazineyi bul</small>
          </button>
        </div>
      </section>
    `);
  }

  private renderRoom(): string {
    if (!this.room || !this.role) {
      return "";
    }

    const phase = this.room.phase;

    if (phase === "lobby") {
      return this.renderLobby();
    }

    if (phase === "safety") {
      return this.renderSafety();
    }

    if (phase === "scanning") {
      return this.renderScanning();
    }

    if (phase === "hiding") {
      return this.renderHiding();
    }

    if (phase === "seeking" || phase === "treasure") {
      return this.renderSeeking();
    }

    return this.renderFinished();
  }

  private renderLobby(): string {
    const room = this.requireRoom();
    const roleReady = this.role === "hider" ? room.hiderReady : room.seekerReady;
    const hiderClass = room.hiderReady ? "ready" : "";
    const seekerClass = room.seekerReady ? "ready" : "";

    return this.shell(`
      <section class="panel lobby-panel">
        ${this.renderRoomHeader()}
        <div class="code-card">
          <span>Oda Kodu</span>
          <strong>${room.code}</strong>
        </div>
        <div class="ready-grid">
          <div class="ready-tile ${hiderClass}">Saklayan<span>${room.hiderReady ? "Hazır" : "Bekliyor"}</span></div>
          <div class="ready-tile ${seekerClass}">Bulan<span>${room.seekerReady ? "Hazır" : "Bekliyor"}</span></div>
        </div>
        <button class="primary-button" data-action="ready" ${roleReady ? "disabled" : ""}>
          Hazırım, Başlayabiliriz
        </button>
      </section>
    `);
  }

  private renderSafety(): string {
    const isHider = this.role === "hider";

    return this.shell(`
      <section class="camera-stage">
        <video class="camera-video" autoplay muted playsinline></video>
        <div class="stage-shade"></div>
      </section>
      <section class="bottom-sheet">
        ${this.renderRoomHeader()}
        <p class="eyebrow">Güvenlik ve İzin</p>
        <h2>Alanı güvenli hale getir</h2>
        <ul class="warning-list">
          <li>Yürürken ekrana değil çevrene bak.</li>
          <li>Merdiven, cam, keskin köşe ve kırılabilir eşyaların yanında koşma.</li>
          <li>Kamera, pusula ve titreşim bu prototipin çalışması için kullanılır.</li>
        </ul>
        <div class="status-strip">
          <span>${this.mediaReady ? "İzinler açık" : "İzinler bekleniyor"}</span>
          <span>${escapeHtml(this.xrStatus.message)}</span>
        </div>
        <button class="primary-button" data-action="permissions">
          Kamera ve Sensörleri Aç
        </button>
        ${
          isHider
            ? `<button class="secondary-button" data-action="start-scan" ${this.mediaReady ? "" : "disabled"}>
                Kalibre Et ve Evi Tara
              </button>`
            : `<button class="secondary-button" disabled>
                Saklayan evi tarayacak
              </button>
              <p class="muted">Senin tarama yapmana gerek yok. Saklayan planı oluşturunca aynı oda planı bu telefona aktarılacak.</p>`
        }
      </section>
    `);
  }

  private renderScanning(): string {
    const room = this.requireRoom();
    const scanState = this.scanEstimator.getProgress();
    const complete = scanState.canComplete;
    const title = this.role === "hider" ? "Evi tara" : "Oyun alanını kalibre et";

    if (this.role === "seeker") {
      return this.shell(`
        <section class="camera-stage waiting-bg">
          ${this.renderRoomPlanOverlay()}
        </section>
        <section class="hud top-hud">
          ${this.renderRoomHeader()}
        </section>
        <section class="bottom-sheet compact">
          <p class="eyebrow">Oda Planı</p>
          <h2>Saklayan tarıyor</h2>
          <p class="muted">Evi sen taramayacaksın. Saklayan taramayı bitirince plan bu telefona otomatik gelecek.</p>
          <div class="metric-row"><span>Plan durumu</span><strong>Bekleniyor</strong></div>
        </section>
      `);
    }

    return this.shell(`
      <section class="camera-stage">
        <video class="camera-video" autoplay muted playsinline></video>
        <div class="scan-reticle"></div>
      </section>
      <section class="hud top-hud">
        ${this.renderRoomHeader()}
      </section>
      <section class="bottom-sheet compact">
        <p class="eyebrow">${PHASE_LABELS[room.phase]}</p>
        <h2>${title}</h2>
        <div class="progress-shell">
          <div class="progress-bar" style="width:${scanState.progress}%"></div>
        </div>
        <div class="metric-row">
          <span>Tarama</span>
          <strong>${scanState.progress}%</strong>
        </div>
        <div class="scan-metrics">
          <span>Yön: ${Math.round(scanState.coverage)}%</span>
          <span>Hareket: ${Math.round(scanState.motionScore)}%</span>
          <span>Süre: ${Math.floor(scanState.elapsedMs / 1000)} sn</span>
        </div>
        <p class="muted">${escapeHtml(scanState.status)}</p>
        ${
          this.role === "hider"
            ? `<button class="primary-button" data-action="scan-complete" ${complete ? "" : "disabled"}>Tarama Tamamlandı</button>`
            : `<p class="muted">Saklayan taramayı bitirince saklama aşaması başlayacak.</p>`
        }
      </section>
    `);
  }

  private renderHiding(): string {
    const room = this.requireRoom();
    const placedCount = room.keys.length;
    const remaining = getRemainingMs(room.hideEndsAt);

    if (this.role === "seeker") {
      return this.shell(`
        <section class="camera-stage waiting-bg">
          ${this.renderRoomPlanOverlay()}
        </section>
        <section class="bottom-sheet">
          ${this.renderRoomHeader()}
          <p class="eyebrow">Bekleme</p>
          <h2>Saklayan anahtarları gizliyor</h2>
          <div class="large-timer">${formatClock(remaining)}</div>
          <p class="muted">Oda planı alındı. Arama süresi Saklayan bitirdiğinde başlayacak.</p>
        </section>
      `);
    }

    return this.shell(`
      <section class="camera-stage">
        <video class="camera-video" autoplay muted playsinline></video>
        <div class="scan-reticle active"></div>
        ${this.renderKeyAnchorMarker()}
      </section>
      <section class="hud top-hud">
        ${this.renderRoomHeader()}
        <div class="timer-chip">${formatClock(remaining)}</div>
      </section>
      <section class="bottom-sheet compact">
        <p class="eyebrow">Saklama Aşaması</p>
        <h2>Anahtar ${placedCount} / ${room.keyCount}</h2>
        <button class="primary-button" data-action="mark-key" ${placedCount >= room.keyCount ? "disabled" : ""}>
          Anahtarı Tara
        </button>
        <div class="key-list">${this.renderKeyList(room.keys)}</div>
        <button class="danger-button" data-action="finish-hiding" ${placedCount >= room.keyCount ? "" : "disabled"}>
          Sakladım, Bitir
        </button>
      </section>
    `);
  }

  private renderSeeking(): string {
    const room = this.requireRoom();

    if (this.role === "hider") {
      const remaining = getRemainingMs(room.seekEndsAt);
      const found = room.keys.filter((key) => key.found).length;

      return this.shell(`
        <section class="camera-stage waiting-bg">
          ${this.renderRoomPlanOverlay()}
        </section>
        <section class="bottom-sheet">
          ${this.renderRoomHeader()}
          <p class="eyebrow">Takip</p>
          <h2>Bulan avda</h2>
          <div class="large-timer">${formatClock(remaining)}</div>
          <div class="metric-row"><span>Bulunan Anahtar</span><strong>${found} / ${room.keyCount}</strong></div>
        </section>
      `);
    }

    const guidance = this.getGuidance();
    const activeKey = getActiveKey(room);
    const isTreasure = room.phase === "treasure";
    const remaining = getRemainingMs(room.seekEndsAt);
    const cameraPrompt = this.mediaReady
      ? ""
      : `<div class="camera-off"><span>Kamera kapalı</span><button data-action="permissions">Kamerayı Aç</button></div>`;

    if (isTreasure) {
      void this.feedback.start().catch(() => undefined);
    } else {
      this.feedback.stop();
    }

    return this.shell(`
      <section class="camera-stage">
        <video class="camera-video" autoplay muted playsinline></video>
        ${cameraPrompt}
      </section>
      <section class="hud top-hud">
        ${this.renderRoomHeader()}
        <div class="timer-chip">${formatClock(remaining)}</div>
      </section>
      <section class="bottom-sheet compact">
        <p class="eyebrow">${isTreasure ? "Hazine" : "Bulma Sistemi"}</p>
        <h2>${escapeHtml(guidance?.targetLabel ?? "Hedef aranıyor")}</h2>
        ${this.renderSeekerCompass(guidance)}
        <div class="compass-readout">
          <span>${escapeHtml(guidance?.directionLabel ?? "Yön bekleniyor")}</span>
          <strong>${formatDistance(guidance?.distance ?? null)}</strong>
        </div>
        ${
          isTreasure
            ? `<div class="detector-panel"><span>Telefon dedektörü aktif</span><strong>${guidance?.proximity ?? 0}%</strong></div>
               <div class="metric-row"><span>Titreşim</span><strong>${getVibrationLabel(guidance?.proximity ?? 0)}</strong></div>`
            : `<div class="progress-shell proximity"><div class="progress-bar" style="width:${guidance?.proximity ?? 0}%"></div></div>
               <div class="metric-row"><span>Yakınlık</span><strong>${guidance?.proximity ?? 0}%</strong></div>
               <div class="metric-row"><span>Mesafe</span><strong>${formatDistance(guidance?.distance ?? null)}</strong></div>`
        }
        ${
          isTreasure
            ? `<button class="danger-button" data-action="found-treasure">Buldum</button>`
            : `<p class="question">${activeKey?.index ?? 1}. Anahtarı Aldın mı?</p>
               <button class="primary-button" data-action="found-key">Aldım</button>`
        }
      </section>
    `);
  }

  private renderFinished(): string {
    const room = this.requireRoom();
    const winnerText = room.winner === "seeker" ? "Bulan kazandı" : "Saklayan kazandı";

    this.feedback.stop();

    return this.shell(`
      <section class="panel result-panel">
        ${this.renderRoomHeader()}
        <p class="eyebrow">Sonuç</p>
        <h1>${winnerText}</h1>
        <p class="subcopy">${room.winner === "seeker" ? "Hazine bulundu." : "Süre bitti."}</p>
        <button class="secondary-button" data-action="reset">Ana Ekrana Dön</button>
      </section>
    `);
  }

  private shell(content: string): string {
    return `
      <div class="app-shell">
        ${content}
        ${this.error ? `<div class="toast error">${escapeHtml(this.error)}</div>` : ""}
        ${this.notice ? `<div class="toast notice">${escapeHtml(this.notice)}</div>` : ""}
        ${this.service.kind === "local" ? `<div class="service-badge">Demo: kod sadece bu cihazda</div>` : ""}
      </div>
    `;
  }

  private renderRoomHeader(): string {
    const room = this.requireRoom();
    const roleLabel = this.role === "hider" ? "Saklayan" : "Bulan";

    return `
      <header class="room-header">
        <span>${roleLabel}</span>
        <strong>${room.code}</strong>
        <span>${PHASE_LABELS[room.phase]}</span>
      </header>
    `;
  }

  private renderKeyList(keys: TreasureKey[]): string {
    if (keys.length === 0) {
      return `<p class="muted">Henüz anahtar işaretlenmedi.</p>`;
    }

    return keys
      .map((key) => `<div class="key-row"><span>${escapeHtml(key.label)}</span><strong>${key.found ? "Alındı" : "Gizli"}</strong></div>`)
      .join("");
  }

  private renderSeekerCompass(guidance: GuidanceState | null): string {
    const compassOffset = guidance ? clamp(guidance.delta / 90, -1, 1) * 42 : 0;

    return `
      <div class="seeker-compass" aria-label="Pusula">
        <div class="compass-track">
          <span>Sol</span>
          <span>Ön</span>
          <span>Sağ</span>
        </div>
        <div class="compass-arrow" style="left:${50 + compassOffset}%; transform: translateX(-50%) rotate(${guidance?.delta ?? 0}deg)"></div>
      </div>
    `;
  }

  private renderRoomPlanOverlay(): string {
    const room = this.requireRoom();
    const markers = room.keys
      .map((key, index) => {
        const left = 25 + (index % 3) * 24;
        const top = 34 + Math.floor(index / 3) * 20;
        return `<span class="plan-key" style="left:${left}%;top:${top}%">${key.index}</span>`;
      })
      .join("");

    return `
      <div class="room-plan" aria-label="Oda planı">
        <div class="room-plan-grid"></div>
        <span class="plan-origin">Başlangıç</span>
        ${markers}
      </div>
    `;
  }

  private renderKeyAnchorMarker(): string {
    const room = this.requireRoom();
    const index = this.lastMarkedKeyIndex ?? room.keys.at(-1)?.index ?? null;

    if (!index) {
      return "";
    }

    return `
      <div class="key-anchor-marker">
        <span>${index}. Anahtar</span>
      </div>
    `;
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
      element.addEventListener("click", () => {
        void this.handleAction(element.dataset.action ?? "");
      });
    });

    this.root.querySelector<HTMLInputElement>("#join-code")?.addEventListener("input", (event) => {
      const target = event.target as HTMLInputElement;
      this.joinCode = target.value.replace(/\D/g, "").slice(0, 3);
      target.value = this.joinCode;
      this.render();
    });

  }

  private async handleAction(action: string): Promise<void> {
    this.error = "";
    this.notice = "";

    try {
      switch (action) {
        case "choose-hider":
          this.setupView = "hider-setup";
          break;
        case "choose-seeker":
          this.setupView = "seeker-join";
          break;
        case "back":
          this.setupView = "home";
          break;
        case "increase-keys":
          this.selectedKeyCount = Math.min(this.selectedKeyCount + 1, MAX_KEYS);
          break;
        case "decrease-keys":
          this.selectedKeyCount = Math.max(this.selectedKeyCount - 1, MIN_KEYS);
          break;
        case "create-room":
          await this.createRoom();
          break;
        case "join-room":
          await this.joinRoom();
          break;
        case "ready":
          await this.ready();
          break;
        case "permissions":
          await this.requestPermissions();
          return;
        case "start-scan":
          await this.startScan();
          break;
        case "boost-scan":
          this.forceScanForLocalTest();
          break;
        case "scan-complete":
          await this.completeScan();
          break;
        case "mark-key":
          await this.markKey();
          break;
        case "finish-hiding":
          await this.finishHiding();
          break;
        case "found-key":
          await this.foundKey();
          break;
        case "found-treasure":
          await this.foundTreasure();
          break;
        case "reset":
          this.reset();
          break;
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Beklenmeyen hata oluştu.";
    }

    this.render();
  }

  private async createRoom(): Promise<void> {
    const room = await this.service.createRoom(this.selectedKeyCount);
    this.role = "hider";
    this.setRoom(room);
  }

  private async joinRoom(): Promise<void> {
    const room = await this.service.joinRoom(this.joinCode);
    this.role = "seeker";
    this.setRoom(room);
  }

  private async ready(): Promise<void> {
    const room = this.requireRoom();
    const role = this.requireRole();

    await this.service.setReady(room.id, role, true);
    const fresh = await this.service.getRoom(room.id);

    if (bothPlayersReady(fresh) && fresh.phase === "lobby") {
      await this.service.updateRoom(fresh.id, {
        phase: getPhaseAfterReady(fresh),
        countdownStartsAt: new Date(Date.now() + READY_COUNTDOWN_SECONDS * 1000).toISOString()
      });
    }

    await this.syncRoom(room.id);
  }

  private async requestPermissions(): Promise<void> {
    await this.sensors.requestOrientation();
    await this.tracker.requestMotionPermission().catch(() => {
      this.notice = "Hareket izni alınamadı; mesafe tahmini daha sınırlı olabilir.";
    });
    this.cameraStream = await this.sensors.requestCamera();

    this.mediaReady = true;
    this.render();
    await this.attachCameraPreview(this.role === "hider");
  }

  private async startScan(): Promise<void> {
    const room = this.requireRoom();

    if (this.role !== "hider") {
      this.notice = "Evi sadece Saklayan tarar. Plan bu telefona otomatik aktarılacak.";
      return;
    }

    this.scanEstimator.reset();
    this.scanProgress = 0;
    const calibration = {
      originHeading: this.compass.heading,
      originPosition: ZERO,
      calibratedAt: new Date().toISOString()
    };

    await this.service.updateRoom(room.id, {
      phase: "scanning",
      calibration
    });
    await this.syncRoom(room.id);
  }

  private forceScanForLocalTest(): void {
    if (!isLocalTestHost()) {
      return;
    }

    this.scanEstimator.forceComplete();
    this.scanProgress = this.scanEstimator.getProgress().progress;
    this.render();
  }

  private async completeScan(): Promise<void> {
    const room = this.requireRoom();

    if (this.role !== "hider") {
      this.notice = "Saklayan saklama aşamasını başlatacak.";
      return;
    }

    if (!this.scanEstimator.isComplete()) {
      throw new Error("Tarama yeterli değil. Bar dolmadan bu aşama bitmez.");
    }

    await this.service.updateRoom(room.id, buildHidingPatch());
    await this.syncRoom(room.id);
  }

  private async markKey(): Promise<void> {
    const room = this.requireRoom();
    const nextIndex = room.keys.length + 1;

    if (nextIndex > room.keyCount) {
      return;
    }

    const label = `Anahtar ${nextIndex}`;
    const position = this.capturePosition(1.25 + nextIndex * 0.55);

    await this.service.addKey(room.id, {
      index: nextIndex,
      label,
      position
    });
    this.lastMarkedKeyIndex = nextIndex;
    await this.syncRoom(room.id);
  }

  private async finishHiding(): Promise<void> {
    const room = await this.service.getRoom(this.requireRoom().id);
    const completedRoom = {
      ...room,
      treasurePosition: room.treasurePosition ?? this.capturePosition(2.4 + room.keyCount * 0.45)
    };

    if (!isHidingComplete(completedRoom)) {
      throw new Error("Tüm anahtarları işaretlemeden oyun başlatılamaz.");
    }

    await this.service.setTreasurePosition(room.id, completedRoom.treasurePosition);
    await this.service.updateRoom(room.id, buildSeekingPatch());
    await this.syncRoom(room.id);
  }

  private async foundKey(): Promise<void> {
    const room = this.requireRoom();
    const activeKey = getActiveKey(room);
    const isLastKey = room.keys.filter((key) => !key.found).length <= 1;

    if (!activeKey) {
      await this.service.updateRoom(room.id, { phase: "treasure" });
      await this.syncRoom(room.id);
      return;
    }

    await this.service.markKeyFound(room.id, activeKey.index);
    await this.syncRoom(room.id);

    if (isLastKey) {
      this.feedback.setProximity(55);
      this.feedback.pulseNow(55);
      await this.feedback.start().catch(() => undefined);
    }
  }

  private async foundTreasure(): Promise<void> {
    const room = this.requireRoom();
    await this.service.updateRoom(room.id, { phase: "finished", winner: "seeker" });
    await this.syncRoom(room.id);
  }

  private setRoom(room: RoomState): void {
    this.room = room;
    this.unsubscribeRoom?.();
    this.unsubscribeRoom = this.service.subscribe(room.id, (nextRoom) => {
      this.room = nextRoom;
      this.render();
    });
  }

  private async syncRoom(roomId: string): Promise<RoomState> {
    const room = await this.service.getRoom(roomId);
    this.room = room;
    return room;
  }

  private reset(): void {
    this.unsubscribeRoom?.();
    this.unsubscribeRoom = null;
    this.room = null;
    this.role = null;
    this.setupView = "home";
    this.selectedKeyCount = 1;
    this.joinCode = "";
    this.lastMarkedKeyIndex = null;
    this.error = "";
    this.notice = "";
    this.mediaReady = false;
    this.cameraStream = null;
    this.scanProgress = 0;
    this.feedback.stop();
    this.xr.stop();
    this.tracker.reset();
  }

  private async attachCameraPreview(startXR = false): Promise<void> {
    const video = this.root.querySelector<HTMLVideoElement>(".camera-video");

    if (video && this.cameraStream) {
      video.srcObject = this.cameraStream;
      await video.play().catch(() => undefined);
    }

    if (startXR) {
      const stage = this.root.querySelector<HTMLElement>(".camera-stage");

      if (stage) {
        this.xrStatus = await this.xr.start(stage);
        this.mountXRCanvas();
      }
    }
  }

  private mountXRCanvas(): void {
    const stage = this.root.querySelector<HTMLElement>(".camera-stage");

    if (stage) {
      this.xr.mount(stage);
    }
  }

  private capturePosition(distanceMeters: number): Vector3 {
    const tracked = this.xr.capturePoint(this.tracker.getPosition());

    if (horizontalDistance(tracked, ZERO) > 0.75) {
      return tracked;
    }

    const heading = (this.compass.heading * Math.PI) / 180;

    return {
      x: Math.sin(heading) * distanceMeters,
      y: 0,
      z: Math.cos(heading) * distanceMeters
    };
  }

  private getGuidance(): GuidanceState | null {
    const room = this.requireRoom();
    const target = room.phase === "treasure" ? room.treasurePosition : getActiveKey(room)?.position ?? null;

    if (!target) {
      return null;
    }

    const current = this.xr.getCurrentPosition(this.tracker.getPosition());
    const targetLabel =
      room.phase === "treasure"
        ? "Saklayanın Telefonu"
        : `${room.activeKeyIndex}. Anahtar`;
    const bearing = bearingTo(current, target);
    const delta = signedAngleDelta(this.compass.heading, bearing);
    const distance = horizontalDistance(current, target);

    return {
      targetLabel,
      distance,
      proximity: proximityPercent(distance),
      delta,
      directionLabel: relativeDirectionLabel(delta)
    };
  }

  private installDebugHooks(): void {
    const debugWindow = window as Window & {
      render_game_to_text?: () => string;
      advanceTime?: (ms: number) => void;
    };

    debugWindow.render_game_to_text = () =>
      JSON.stringify({
        role: this.role,
        phase: this.room?.phase ?? "setup",
        code: this.room?.code ?? null,
        keyCount: this.room?.keyCount ?? 0,
        keysPlaced: this.room?.keys.length ?? 0,
        activeKeyIndex: this.room?.activeKeyIndex ?? null,
        mediaReady: this.mediaReady,
        scanProgress: this.scanProgress,
        guidance: this.room ? this.getGuidance() : null
      });
    debugWindow.advanceTime = () => this.tick();

    if (isLocalTestHost()) {
      (debugWindow as Window & { treasureHuntTest?: { forceScanComplete: () => void } }).treasureHuntTest = {
        forceScanComplete: () => this.forceScanForLocalTest()
      };
    }
  }

  private requireRoom(): RoomState {
    if (!this.room) {
      throw new Error("Aktif oda yok.");
    }

    return this.room;
  }

  private requireRole(): PlayerRole {
    if (!this.role) {
      throw new Error("Rol seçilmedi.");
    }

    return this.role;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDistance(distance: number | null): string {
  if (distance === null || !Number.isFinite(distance)) {
    return "-- m";
  }

  if (distance < 0.45) {
    return "çok yakın";
  }

  if (distance > 9.5) {
    return "10+ m";
  }

  return `${distance.toFixed(1)} m`;
}

function getVibrationLabel(proximity: number): string {
  if (proximity >= 80) {
    return "Çok güçlü";
  }

  if (proximity >= 45) {
    return "Artıyor";
  }

  if (proximity >= 12) {
    return "Hafif";
  }

  return "Uzak";
}

function isLocalTestHost(): boolean {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}
