import * as Phaser from "phaser";
import {
  CAMERA_DRAG_THRESHOLD,
  CAMERA_LERP,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_SENSITIVITY,
} from "../config/constants";

export class CameraController {
  private scene: Phaser.Scene;
  private playerSprite: Phaser.Physics.Arcade.Sprite;

  cameraDragging = false;
  cameraFollowing = true;
  mapWidth = 0;
  mapHeight = 0;
  fitMode = false; // Default to operational zoom so agents remain clearly visible

  constructor(
    scene: Phaser.Scene,
    playerSprite: Phaser.Physics.Arcade.Sprite,
    mapWidth: number,
    mapHeight: number,
  ) {
    this.scene = scene;
    this.playerSprite = playerSprite;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
  }

  init() {
    const cam = this.scene.cameras.main;
    cam.setBackgroundColor("#09090b"); // Standard theme dark neutral
    cam.setRoundPixels(true);

    this.updateCameraBounds();

    if (this.fitMode) {
      this.applyFitZoom();
    } else {
      cam.setZoom(ZOOM_DEFAULT);
      cam.startFollow(this.playerSprite, true, CAMERA_LERP, CAMERA_LERP);
    }

    this.scene.scale.on("resize", () => this.updateCameraBounds());
    this.initWheel(cam);
    this.initCameraDrag(cam);
  }

  private initWheel(cam: Phaser.Cameras.Scene2D.Camera) {
    const canvas = this.scene.game.canvas;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.ctrlKey ? e.deltaY * 3 : e.deltaY;
      const oldZoom = cam.zoom;
      const newZoom = Phaser.Math.Clamp(
        oldZoom - delta * ZOOM_SENSITIVITY,
        ZOOM_MIN,
        ZOOM_MAX,
      );
      if (newZoom === oldZoom) return;

      if (!this.cameraFollowing) {
        const sx = e.offsetX / cam.scaleManager.displayScale.x;
        const sy = e.offsetY / cam.scaleManager.displayScale.y;
        const worldBefore = cam.getWorldPoint(sx, sy);
        cam.setZoom(newZoom);
        this.updateCameraBounds();
        const worldAfter = cam.getWorldPoint(sx, sy);
        cam.scrollX += worldBefore.x - worldAfter.x;
        cam.scrollY += worldBefore.y - worldAfter.y;
      } else {
        cam.setZoom(newZoom);
        this.updateCameraBounds();
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    this.scene.events.once("shutdown", () =>
      canvas.removeEventListener("wheel", onWheel),
    );
  }

  initCameraDrag(cam: Phaser.Cameras.Scene2D.Camera) {
    let lastX = 0;
    let lastY = 0;

    this.scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        this.cameraDragging = true;
        lastX = pointer.x;
        lastY = pointer.y;
      }
    });

    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!this.cameraDragging || !pointer.leftButtonDown()) return;

      const dx = lastX - pointer.x;
      const dy = lastY - pointer.y;
      lastX = pointer.x;
      lastY = pointer.y;

      if (
        Math.abs(dx) > CAMERA_DRAG_THRESHOLD ||
        Math.abs(dy) > CAMERA_DRAG_THRESHOLD
      ) {
        if (this.cameraFollowing) {
          cam.stopFollow();
          this.cameraFollowing = false;
        }
        cam.scrollX += dx / cam.zoom;
        cam.scrollY += dy / cam.zoom;
      }
    });

    this.scene.input.on("pointerup", () => {
      this.cameraDragging = false;
    });
  }

  resumeCameraFollow() {
    if (!this.cameraFollowing && !this.fitMode) {
      this.scene.cameras.main.startFollow(
        this.playerSprite,
        true,
        CAMERA_LERP,
        CAMERA_LERP,
      );
      this.cameraFollowing = true;
    }
  }

  applyFitZoom() {
    const cam = this.scene.cameras.main;
    const worldWidth = this.mapWidth;
    const worldHeight = this.mapHeight;
    const viewWidth = cam.width;
    const viewHeight = cam.height;

    const zoomX = viewWidth / worldWidth;
    const zoomY = viewHeight / worldHeight;
    const fitZoom = Math.min(zoomX, zoomY);

    cam.setZoom(fitZoom);
    cam.centerOn(worldWidth / 2, worldHeight / 2);
  }

  /** Recalculate camera bounds so the map is centered when viewport > map at current zoom. */
  updateCameraBounds() {
    const cam = this.scene.cameras.main;

    if (this.fitMode) {
      this.applyFitZoom();
      cam.setBounds(0, 0, this.mapWidth, this.mapHeight);
      return;
    }

    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const mw = this.mapWidth;
    const mh = this.mapHeight;

    const bx = viewW > mw ? -(viewW - mw) / 2 : 0;
    const by = viewH > mh ? -(viewH - mh) / 2 : 0;
    const bw = viewW > mw ? viewW : mw;
    const bh = viewH > mh ? viewH : mh;

    cam.setBounds(bx, by, bw, bh);
  }
}
