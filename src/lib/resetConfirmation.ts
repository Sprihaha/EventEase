export type ResetConfirmation = {
  phrase: string;
  username: string;
  password: string;
  acknowledged: boolean;
};

export const RESET_CONFIRMATION = "DELETE ALL APPLICATION DATA";
export const emptyResetConfirmation = (): ResetConfirmation => ({
  phrase: "", username: "", password: "", acknowledged: false,
});
export type ResetConfirmationAction =
  | { type: "edit"; field: "phrase" | "username" | "password"; value: string }
  | { type: "acknowledge"; value: boolean }
  | { type: "clear" };

export function resetConfirmationReducer(state: ResetConfirmation, action: ResetConfirmationAction): ResetConfirmation {
  if (action.type === "clear") return emptyResetConfirmation();
  if (action.type === "acknowledge") return { ...state, acknowledged: action.value };
  return { ...state, [action.field]: action.value };
}

export function canConfirmReset(state: ResetConfirmation, username: string, enabled: boolean): boolean {
  return enabled && state.acknowledged && state.phrase === RESET_CONFIRMATION &&
    state.username === username && state.password.length > 0;
}
