export type EventFormStatus = "draft" | "open" | "closed" | "archived" | "resetting";

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
  /** Blaze/Storage 시절 문서의 읽기 호환용이며 Spark 새 저장에는 사용하지 않는다. */
  storagePath?: string;
  downloadUrl?: string;
  alt: string;
  state: "temp" | "active" | "archived" | "unused";
  contentType?: "image/webp";
  encodedBytes?: number;
}

export interface EventFormImageBlob {
  assetId: string;
  formId: string;
  state: EventFormImageRef["state"];
  contentType: "image/webp";
  dataBase64: string;
  encodedBytes: number;
  width: number;
  height: number;
  alt: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  publicTokenHash?: string;
  versionId?: string;
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
  slotNumber?: 1 | 2;
  contentRevision?: number;
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
  formSnapshot?: Pick<EventFormSlot, "title" | "description" | "eventDateTime" | "location" | "poster" | "completionMessage" | "applicationStartAt" | "applicationEndAt" | "expectedTargetCount">
    & Partial<Pick<EventFormSlot, "duplicatePolicy" | "duplicateFieldId">>;
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
  /** Spark 저장 문서의 UTF-8 JSON Base64. 화면에서는 answers로 안전하게 복원한다. */
  answersBase64?: string;
  answerIds?: string[];
  invalidPayload?: boolean;
  status: "submitted" | "reviewed" | "excluded";
  duplicateWarning?: boolean;
  adminMemo?: string;
  submittedAt?: unknown;
  submitterUid?: string;
  tokenHash?: string;
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
  duplicateFieldId?: string;
  publicAssetIds?: string[];
}
