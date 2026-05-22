import * as THREE from "three";
import type { Vector3 } from "../simulation/types";

export interface XRStatus {
  supported: boolean;
  active: boolean;
  mode: "webxr" | "fallback";
  message: string;
}

export class ARRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private scene: THREE.Scene | null = null;
  private reticle: THREE.Mesh | null = null;
  private session: XRSession | null = null;
  private hitTestSource: XRHitTestSource | null = null;
  private hitTestSourceRequested = false;
  private currentPose: Vector3 | null = null;

  async getStatus(): Promise<XRStatus> {
    const supported = Boolean(navigator.xr && (await navigator.xr.isSessionSupported("immersive-ar").catch(() => false)));

    return {
      supported,
      active: Boolean(this.session),
      mode: supported ? "webxr" : "fallback",
      message: supported
        ? "WebXR AR hazir."
        : "Bu cihazda WebXR AR yok; kamera ustu fallback kullanilacak."
    };
  }

  async start(container: HTMLElement): Promise<XRStatus> {
    const status = await this.getStatus();

    if (!status.supported || !navigator.xr) {
      return status;
    }

    this.setupThree(container);
    const session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test", "local-floor"],
      optionalFeatures: ["anchors", "dom-overlay"],
      domOverlay: { root: document.body }
    });

    this.session = session;
    session.addEventListener("end", this.handleSessionEnd);
    await this.renderer?.xr.setSession(session as never);
    this.renderer?.setAnimationLoop((time, frame) => this.render(time, frame));

    return {
      supported: true,
      active: true,
      mode: "webxr",
      message: "WebXR AR aktif."
    };
  }

  getCurrentPosition(fallback: Vector3): Vector3 {
    return this.currentPose ?? fallback;
  }

  mount(container: HTMLElement): void {
    if (!this.renderer) {
      return;
    }

    if (!this.renderer.domElement.isConnected) {
      container.appendChild(this.renderer.domElement);
    }

    this.handleResize();
  }

  capturePoint(fallback: Vector3): Vector3 {
    return this.getCurrentPosition(fallback);
  }

  stop(): void {
    this.hitTestSource?.cancel();
    this.hitTestSource = null;
    this.hitTestSourceRequested = false;
    this.renderer?.setAnimationLoop(null);
    void this.session?.end().catch(() => undefined);
    this.session = null;
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.reticle = null;
  }

  private setupThree(container: HTMLElement): void {
    if (this.renderer) {
      return;
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.xr.enabled = true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    const light = new THREE.HemisphereLight(0xffffff, 0x335533, 2.2);
    this.scene.add(light);

    const ring = new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xe9c46a, side: THREE.DoubleSide });
    this.reticle = new THREE.Mesh(ring, material);
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    window.addEventListener("resize", this.handleResize);
  }

  private readonly render = (_time: number, frame?: XRFrame): void => {
    if (!this.renderer || !this.scene || !this.camera || !frame || !this.session) {
      return;
    }

    const referenceSpace = this.renderer.xr.getReferenceSpace();

    if (!this.hitTestSourceRequested) {
      this.hitTestSourceRequested = true;
      void this.session
        .requestReferenceSpace("viewer")
        .then((viewerSpace) => this.session?.requestHitTestSource?.({ space: viewerSpace }))
        .then((source) => {
          this.hitTestSource = source ?? null;
        })
        .catch(() => {
          this.hitTestSource = null;
        });
    }

    if (this.hitTestSource && referenceSpace) {
      const hitTestResults = frame.getHitTestResults?.(this.hitTestSource) ?? [];
      const hit = hitTestResults[0];

      if (hit && this.reticle) {
        const pose = hit.getPose(referenceSpace);

        if (pose) {
          this.reticle.visible = true;
          this.reticle.matrix.fromArray(pose.transform.matrix);
          this.currentPose = {
            x: pose.transform.position.x,
            y: pose.transform.position.y,
            z: pose.transform.position.z
          };
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  };

  private readonly handleResize = (): void => {
    if (!this.renderer || !this.camera) {
      return;
    }

    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private readonly handleSessionEnd = (): void => {
    this.session?.removeEventListener("end", this.handleSessionEnd);
    this.session = null;
    this.hitTestSource = null;
    this.hitTestSourceRequested = false;
  };
}
