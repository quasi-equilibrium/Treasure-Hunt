interface Navigator {
  xr?: {
    isSessionSupported(mode: string): Promise<boolean>;
    requestSession(mode: string, options?: XRSessionInit): Promise<XRSession>;
  };
}

interface XRSessionInit {
  requiredFeatures?: string[];
  optionalFeatures?: string[];
  domOverlay?: {
    root: Element;
  };
}

interface XRSession {
  requestReferenceSpace(type: string): Promise<XRReferenceSpace>;
  requestHitTestSource?(options: { space: XRReferenceSpace }): Promise<XRHitTestSource>;
  end(): Promise<void>;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface XRReferenceSpace {}

interface XRHitTestSource {
  cancel(): void;
}

interface XRFrame {
  getHitTestResults?(source: XRHitTestSource): XRHitTestResult[];
}

interface XRHitTestResult {
  getPose(referenceSpace: XRReferenceSpace): XRPose | null;
}

interface XRPose {
  transform: {
    matrix: Float32Array;
    position: {
      x: number;
      y: number;
      z: number;
    };
  };
}
