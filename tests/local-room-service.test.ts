import { beforeEach, describe, expect, it } from "vitest";
import { LocalRoomService } from "../src/network/LocalRoomService";

describe("LocalRoomService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates and joins rooms by code", async () => {
    const service = new LocalRoomService();
    const room = await service.createRoom(2);
    const joined = await service.joinRoom(room.code);

    expect(joined.id).toBe(room.id);
    expect(joined.keyCount).toBe(2);
  });

  it("tracks ready state and key progress", async () => {
    const service = new LocalRoomService();
    const room = await service.createRoom(2);

    await service.setReady(room.id, "hider", true);
    await service.setReady(room.id, "seeker", true);
    await service.addKey(room.id, { index: 1, label: "Yastık", position: { x: 1, y: 0, z: 0 } });
    await service.addKey(room.id, { index: 2, label: "Kitaplık", position: { x: 2, y: 0, z: 0 } });
    await service.markKeyFound(room.id, 1);

    const updated = await service.getRoom(room.id);

    expect(updated.hiderReady).toBe(true);
    expect(updated.seekerReady).toBe(true);
    expect(updated.activeKeyIndex).toBe(2);
    expect(updated.phase).toBe("seeking");
  });

  it("moves to treasure after the last key", async () => {
    const service = new LocalRoomService();
    const room = await service.createRoom(1);

    await service.addKey(room.id, { index: 1, label: "Kutu", position: { x: 1, y: 0, z: 1 } });
    await service.markKeyFound(room.id, 1);

    const updated = await service.getRoom(room.id);

    expect(updated.phase).toBe("treasure");
  });
});
