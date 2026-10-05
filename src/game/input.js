// Keyboard, touch buttons, gamepad and optional tilt steering.
export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, throttle: false, brake: false };
    this.tiltOn = false; this.tilt = 0;
    this.pressed = new Set(); // edge-triggered actions
    this.padPrev = [];
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.onPress(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('deviceorientation', (e) => {
      if (!this.tiltOn || e.gamma == null) return;
      const landscape = Math.abs(window.orientation || 0) === 90 || innerWidth > innerHeight;
      const raw = landscape ? (e.beta || 0) * ((window.orientation || 90) === 90 ? 1 : -1) : (e.gamma || 0);
      this.tilt = Math.max(-1, Math.min(1, raw / 25));
    });
  }
  onPress(code) {
    const map = { KeyC: 'camera', ShiftLeft: 'shiftUp', ShiftRight: 'shiftUp', ControlLeft: 'shiftDown', ControlRight: 'shiftDown', KeyE: 'shiftUp', KeyQ: 'shiftDown', Escape: 'pause', KeyP: 'pause', KeyR: 'reset', KeyL: 'line', Digit1: 'focusPrev', Digit2: 'focusNext' };
    if (map[code]) this.pressed.add(map[code]);
  }
  press(action) { this.pressed.add(action); }
  consume(action) { if (this.pressed.has(action)) { this.pressed.delete(action); return true; } return false; }
  clearEdges() { this.pressed.clear(); }
  bindTouch(el, key) {
    const on = (e) => { e.preventDefault(); this.touch[key] = true; el.classList.add('active'); };
    const off = (e) => { e.preventDefault(); this.touch[key] = false; el.classList.remove('active'); };
    el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
    el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') on(e); });
    el.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') off(e); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') off(e); });
  }
  read() {
    const k = this.keys;
    let steer = 0, throttle = 0, brake = 0, analog = false;
    if (k.has('ArrowLeft') || k.has('KeyA') || this.touch.left) steer -= 1;
    if (k.has('ArrowRight') || k.has('KeyD') || this.touch.right) steer += 1;
    if (k.has('ArrowUp') || k.has('KeyW') || this.touch.throttle) throttle = 1;
    if (k.has('ArrowDown') || k.has('KeyS') || k.has('Space') || this.touch.brake) brake = 1;
    if (this.tiltOn && Math.abs(this.tilt) > 0.06 && steer === 0) { steer = this.tilt; analog = true; }
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) { steer = Math.max(-1, Math.min(1, ax * 1.15)); analog = true; }
      const b = (i) => p.buttons[i] ? p.buttons[i].value || (p.buttons[i].pressed ? 1 : 0) : 0;
      throttle = Math.max(throttle, b(7), b(0) > 0.5 ? 1 : 0);
      brake = Math.max(brake, b(6), b(1) > 0.5 && false ? 1 : 0);
      if (b(14) > 0.5) steer = -1; if (b(15) > 0.5) steer = 1;
      const edge = (i, act) => { const now = b(i) > 0.5; if (now && !this.padPrev[i]) this.pressed.add(act); this.padPrev[i] = now; };
      edge(5, 'shiftUp'); edge(4, 'shiftDown'); edge(3, 'camera'); edge(9, 'pause'); edge(2, 'reset');
      break;
    }
    return { steer, throttle, brake, analog, shiftUp: this.consume('shiftUp'), shiftDown: this.consume('shiftDown'), reset: this.consume('reset') };
  }
}
