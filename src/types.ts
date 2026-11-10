/** A numeric expression: a literal number or a string such as `"$1 * 2 + $rand"`. */
export type Expr = number | string;

export type DirectionKind = "aim" | "absolute" | "relative" | "sequence";
export type SpeedKind = "absolute" | "relative" | "sequence";
export type AccelKind = "absolute" | "relative" | "sequence";

export interface Direction { kind: DirectionKind; value: Expr }
export interface Speed { kind: SpeedKind; value: Expr }
export interface AccelValue { kind: AccelKind; value: Expr }

export interface Action {
  type: "action";
  label?: string;
  commands: Command[];
}
export interface ActionRef { type: "actionRef"; label: string; params: Expr[] }

export interface Bullet {
  type: "bullet";
  label?: string;
  direction?: Direction;
  speed?: Speed;
  actions: (Action | ActionRef)[];
}
export interface BulletRef { type: "bulletRef"; label: string; params: Expr[] }

export interface Fire {
  type: "fire";
  label?: string;
  direction?: Direction;
  speed?: Speed;
  bullet: Bullet | BulletRef;
}
export interface FireRef { type: "fireRef"; label: string; params: Expr[] }

export interface Repeat { type: "repeat"; times: Expr; action: Action | ActionRef }
export interface Wait { type: "wait"; frames: Expr }
export interface ChangeDirection { type: "changeDirection"; direction: Direction; term: Expr }
export interface ChangeSpeed { type: "changeSpeed"; speed: Speed; term: Expr }
export interface Accel {
  type: "accel";
  horizontal?: AccelValue;
  vertical?: AccelValue;
  term: Expr;
}
export interface Vanish { type: "vanish" }
/** Assign `$variable` for the rest of the enclosing action. XML: `<bind variable="x">expr</bind>`. */
export interface Bind { type: "bind"; variable: string; value: Expr }
/** Tell the host game something happened. XML: `<notify event="x"><param>1</param></notify>`. */
export interface Notify { type: "notify"; event: string; params: Expr[] }

export type Command =
  | Action | ActionRef | Fire | FireRef | Repeat | Wait
  | ChangeDirection | ChangeSpeed | Accel | Vanish | Bind | Notify;

/** A parsed BulletML document. */
export interface BulletML {
  /** `vertical` (default): absolute direction 0 points up. `horizontal`: 0 points right. */
  orientation: "vertical" | "horizontal";
  actions: Action[];
  bullets: Bullet[];
  fires: Fire[];
}
