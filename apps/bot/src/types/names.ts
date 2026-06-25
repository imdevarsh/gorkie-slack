interface ProfileField {
  label: string;
  value: string;
}

export interface UserProfile {
  displayName?: string;
  fields?: ProfileField[];
  pronouns?: string;
  realName?: string;
  status?: string;
  title?: string;
}
