export type LoadingOption = boolean | string[];

export interface SetStatusParams {
  loading?: LoadingOption;
  status: string;
}
