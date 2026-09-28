export type EventFormStatus = "draft" | "open" | "closed" | "archived";

export type EventFormFieldType =
  | "shortText"
  | "longText"
  | "name"
  | "phone"
  | "number"
  | "email"
  | "date"
  | "singleChoice"
  | "multipleChoice"
  | "dropdown"
  | "attendance"
  | "address"
  | "consent"
  | "notice"
  | "divider";

export interface EventFormImageRef {
  assetId: string;
  storagePath: string;
  downloadUrl?: string;
  alt: string;
  state: "temp" | "active" | "archived" | "unused";
}

export interface EventFormOption {
  id: string;
  label: string;
  order: number;
  enabled: boolean;
  image?: EventFormImageRef;
}

export interface EventFormField {
  id: string;
  type: EventFormFieldType;
  title: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  visible: boolean;
  order: number;
  image?: EventFormImageRef;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  options?: EventFormOption[];
  minSelections?: number;
  maxSelections?: number;
  allowOther?: boolean;
  otherRequired?: boolean;
  otherMaxLength?: number;
  dateMin?: string;
  dateMax?: string;
  allowPast?: boolean;
  allowFuture?: boolean;
  consentText?: string;
  consentVersion?: string;
  consentRequired?: boolean;
  privacyPolicyUrl?: string;
}

export interface EventFormSlot {
  id?: string;
  publicToken?: string;
  tokenHash?: string;
  ownerUid: string;
  title: string;
  description: string;
  eventDateTime?: string;
  location?: string;
  poster?: EventFormImageRef | null;
  applicationStartAt?: string;
  applicationEndAt?: string;
  completionMessage: string;
  status: EventFormStatus;
  activeRoundId?: string;
  activeVersionId?: string;
  duplicatePolicy: "none" | "warn" | "block";
  duplicateFieldId?: string;
  expectedTargetCount?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  createdBy?: string;
  updatedBy?: string;
  publishedBy?: string;
  publishedAt?: unknown;
}

export interface EventFormVersion {
  id?: string;
  formId: string;
  roundId: string;
  version: number;
  fields: EventFormField[];
  formSnapshot?: Pick<EventFormSlot, "title" | "description" | "eventDateTime" | "location" | "poster" | "completionMessage" | "applicationStartAt" | "applicationEndAt" | "expectedTargetCount">;
  publishedAt?: unknown;
  publishedBy?: string;
}

export interface EventFormRound {
  id?: string;
  formId: string;
  name: string;
  status: EventFormStatus;
  versionId?: string;
  responseCount: number;
  openedAt?: unknown;
  closedAt?: unknown;
  createdAt?: unknown;
  roundStartedBy?: string;
  roundStartedAt?: unknown;
}

export interface EventFormAddressAnswer {
  zonecode: string;
  roadAddress: string;
  jibunAddress?: string;
  detailAddress: string;
  extraAddress?: string;
  displayAddress: string;
}

export interface EventFormConsentAnswer {
  agreed: boolean;
  consentVersion: string;
  consentTextSnapshot: string;
  agreedAt?: string;
}

export interface EventFormChoiceAnswer {
  optionIds: string[];
  otherSelected: boolean;
  otherText?: string;
}

export type EventFormAnswerValue =
  | string
  | number
  | boolean
  | EventFormAddressAnswer
  | EventFormConsentAnswer
  | EventFormChoiceAnswer;

export type EventFormAnswers = Record<string, EventFormAnswerValue>;

export interface EventFormSubmission {
  id?: string;
  formId: string;
  roundId: string;
  versionId: string;
  sequence: number;
  answers: EventFormAnswers;
  status: "submitted" | "reviewed" | "excluded";
  duplicateWarning?: boolean;
  adminMemo?: string;
  submittedAt?: unknown;
  submissionUpdatedBy?: string;
  submissionUpdatedAt?: unknown;
}

export interface PublicEventFormPayload {
  formId: string;
  roundId: string;
  versionId: string;
  title: string;
  description: string;
  eventDateTime?: string;
  location?: string;
  poster?: EventFormImageRef | null;
  completionMessage: string;
  status: EventFormStatus;
  fields: EventFormField[];
  duplicatePolicy: EventFormSlot["duplicatePolicy"];
}
