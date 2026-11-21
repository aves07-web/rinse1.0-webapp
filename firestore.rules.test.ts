/**
 * Dirty Dozen Security Rules Verification Spec (Phase 0)
 * Describes automated assertions for Firestore Security Rules invariants.
 */

export interface DirtyDozenScenario {
  id: number;
  name: string;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedOutcome: 'PERMISSION_DENIED';
  rationale: string;
}

export const DIRTY_DOZEN_SCENARIOS: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Unauthenticated rinse_state read',
    path: 'rinse_state/orders',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'request.auth == null must fail Master Auth gate.',
  },
  {
    id: 2,
    name: 'Unverified email admin spoof',
    path: 'rinse_state/orders',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'email_verified must be strictly true even if email matches.',
  },
  {
    id: 3,
    name: 'Cross-user PII profile read',
    path: 'users/victim_uid',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'Users may only read their own PII profile unless verified admin.',
  },
  {
    id: 4,
    name: 'Shadow field injection in rinse_state',
    path: 'rinse_state/orders',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'hasAll + hasOnly rejects unknown ghost keys.',
  },
  {
    id: 5,
    name: 'Post-bootstrap self-admin escalation',
    path: 'admins/attacker_uid',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'Admins cannot be self-created once workspace_config/primary exists.',
  },
  {
    id: 6,
    name: 'Blanket collection list scraping by non-member',
    path: 'rinse_state',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'allow list requires request.auth.uid in resource.data.memberUids.',
  },
  {
    id: 7,
    name: 'Author UID spoofing in rinse_state',
    path: 'rinse_state/meta',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'updatedByUid must equal request.auth.uid.',
  },
  {
    id: 8,
    name: 'Immutable ownerUid mutation attempt',
    path: 'rinse_state/accounting',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'incoming().ownerUid == existing().ownerUid is strictly enforced.',
  },
  {
    id: 9,
    name: 'Invalid/oversized document ID poisoning',
    path: 'rinse_state/bad$id_with_invalid_chars',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'isValidId(docId) enforces ^[a-zA-Z0-9_\\-]+$ and <= 128 length.',
  },
  {
    id: 10,
    name: 'Client-forged updatedAt timestamp',
    path: 'rinse_state/orders',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'updatedAt == request.time prevents backdated or forged timestamps.',
  },
  {
    id: 11,
    name: 'Invalid section enum in rinse_state',
    path: 'rinse_state/arbitrary',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'section must match the explicit Rinse ERP section allowlist.',
  },
  {
    id: 12,
    name: 'Invalid or oversized memberUids array',
    path: 'workspace_config/primary',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'memberUids is size-bounded (1..50) and element-type validated.',
  },
];
