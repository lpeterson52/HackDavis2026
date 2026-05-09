export type TokenCallback = (token: string, done: boolean) => void;

export interface GenerateOptions {
  system?: string;
}
