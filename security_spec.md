# Rinse Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Strict Authentication & Verified Email**: Every read and write across `/users`, `/admins`, `/workspace_config`, `/workspace_invites`, and `/rinse_state` requires a signed-in Firebase user with `request.auth.token.email_verified == true`.
2. **Default-Deny Safety Net**: Any unspecified collection or document path falls into `match /{document=**} { allow read, write: if false; }`.
3. **PII Isolation**: User email addresses and display profiles live inside `/users/{userId}` and `/workspace_invites/{inviteEmail}` and are readable only by the document owner (`uid == userId` or `token.email == inviteEmail`) or a verified admin.
4. **Master Gate & Zero Blanket Queries**:
   - `/rinse_state/{docId}` `list` queries explicitly enforce `request.auth.uid in resource.data.memberUids || resource.data.ownerUid == request.auth.uid || isBootstrappedAdmin()` with zero `get()`/`exists()` lookups inside `allow list`.
   - `/rinse_state/{docId}` writes require membership in `workspace_config/primary` (or admin), strict schema validation (`isValidRinseStateDoc`), immutable `ownerUid`, and `updatedByUid == request.auth.uid`.
5. **Privilege Escalation & Atomic Bootstrap**:
   - Regular users cannot create `/admins/{uid}` once `workspace_config/primary` already exists.
   - Initial workspace creation (`workspace_config/primary` + `admins/{uid}`) is atomically bound via `existsAfter` / `getAfter`.
6. **Temporal Integrity & Boundary Limits**:
   - Every `createdAt` / `updatedAt` timestamp must equal `request.time`.
   - All string fields enforce explicit `.size()` bounds and ID fields match `^[a-zA-Z0-9_\\-]+$`.
   - Arrays (`memberUids`) enforce `.size() >= 1 && .size() <= 50` and first-element type checks.

## 2. Dirty Dozen Adversarial Payloads
1. **Unauthenticated Read/Write (`rinse_state/orders`)**: `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof (`admins/attacker`)**: `email == 'itsdevilsaddress@gmail.com'` with `email_verified: false` -> `PERMISSION_DENIED`.
3. **Cross-User PII Probe (`users/victimUid`)**: Authenticated non-admin user reads `/users/victimUid` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection (`rinse_state/orders`)**: Payload includes extra ghost key `isSuperAdmin: true` -> `PERMISSION_DENIED` (`keys().hasOnly(...)`).
5. **Self-Admin Escalation After Bootstrap (`admins/attackerUid`)**: Non-admin attempts `create` on `/admins/attackerUid` when `workspace_config/primary` already exists -> `PERMISSION_DENIED`.
6. **Unauthorized List Scraping (`collection('rinse_state')`)**: Non-member queries `collection(db, 'rinse_state')` without matching `memberUids` -> `PERMISSION_DENIED`.
7. **Identity Spoofing on State Write (`rinse_state/meta`)**: Valid member writes `updatedByUid: 'someoneElse'` -> `PERMISSION_DENIED`.
8. **Owner Hijack Update (`rinse_state/orders`)**: Member tries to change `ownerUid` to their own UID -> `PERMISSION_DENIED`.
9. **Oversized ID Poisoning (`rinse_state/<200-char invalid id>`)**: Path ID contains spaces/slashes or exceeds 128 chars -> `PERMISSION_DENIED`.
10. **Forged Timestamp (`rinse_state/orders`)**: Client supplies past `updatedAt` instead of `serverTimestamp()` -> `PERMISSION_DENIED`.
11. **Invalid Section Enum (`rinse_state/evil`)**: `section: "malicious_collection"` -> `PERMISSION_DENIED`.
12. **Array Overflow / Non-String Member (`workspace_config/primary`)**: `memberUids: [12345]` or `> 50` entries -> `PERMISSION_DENIED`.
