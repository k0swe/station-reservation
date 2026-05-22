# Station Reservation - Initial Requirements and Design (MVP)

## 1. Problem Statement
Ham radio clubs need a lightweight way to manage reservations for shared radio stations when enterprise groupware is unavailable.

## 2. Product Goals
- Provide a multi-tenant app where each club manages its own members and resources.
- Let clubs create reservable resources (starting with radio stations).
- Allow members to request access and reserve only approved resources.
- Support reservations in fixed, configurable time blocks (for example, 1-hour or 2-hour blocks).

## 3. Non-Goals (MVP)
- Direct integration with external groupware calendars.
- Payment, billing, or membership dues management.
- Advanced scheduling policy enforcement beyond basic block reservations and conflict prevention.
- Platform-wide admin tooling beyond per-club administration.

## 4. Users and Roles
- **Platform Admin (future)**: manages global platform settings.
- **Club Admin**: manages a specific club, resources, memberships, and approvals.
- **Member**: requests access and creates reservations for approved resources.

## 5. Functional Requirements
### 5.1 Multi-Tenancy
- Clubs can sign up and create an isolated tenant/workspace.
- Data must be logically isolated per club (members, resources, reservations, approvals).

### 5.2 Club and Resource Management
- Club Admin can create, edit, and deactivate resources.
- Resource includes at least: name, description, reservation block size, active/inactive status.

### 5.3 Membership and Access Approval
- Users can request membership/access to a club.
- Club Admin can approve or reject membership requests.
- Club Admin can approve resource access per member per resource.
- Member may belong to a club but still be denied access to specific resources.
- Club Admin can promote a member to Club Admin.
- Club Admin can demote another Club Admin to member.
- Club Admin cannot demote themselves.
- The system must enforce that each club always has at least one Club Admin.
- Club Admin can change a member from approved to denied.
- If a member is changed from approved to denied, all of their upcoming reservations in that club are cleared.
- Changing a member from approved to denied must require explicit destructive-action confirmation.

### 5.4 Reservation Management
- Member can view available time slots for resources they are approved to use.
- Member can create reservations only in resource block increments.
- System prevents overlapping reservations for the same resource.
- Member can cancel their own upcoming reservations.
- Club Admin can view and cancel any reservation in their club.

### 5.5 Auditing and Transparency
- Record who created/cancelled reservations and when.
- Keep reservation history for operational review.

### 5.6 Notifications (MVP)
- MVP does not send email or in-app notifications.
- Users are expected to check the app for reservation and approval status.
- Design should leave room to add notifications later.

### 5.7 Timezone Policy (MVP)
- Timezone is determined by each user's browser setting.
- The system should not support a club-level timezone setting in MVP.

## 6. Future Requirements (Not in MVP, design-ready)
- Maximum continuous usage per member.
- Maximum daily usage per member.
- Per-resource booking horizon and blackout windows.
- Waitlist and auto-fill behavior.

## 7. High-Level Design (MVP)
### 7.1 Core Domain Entities
- **Club**
- **User**
- **Membership** (User ↔ Club)
- **Resource** (belongs to Club)
- **ResourceAccessApproval** (Membership ↔ Resource)
- **Reservation** (Resource, Membership, start/end)

### 7.2 Key Rules
- Reservation duration must equal one or more whole resource blocks.
- Reservation must start/end aligned to the block boundary.
- Reservation allowed only when:
  - Membership is approved
  - Resource is active
  - Resource access is approved
  - No overlap exists

### 7.3 Primary Workflows
1. Club admin creates club resources.
2. Member requests club membership.
3. After membership approval, member requests access to one or more resources.
4. Club admin approves or rejects each resource access request.
5. Member reserves available aligned time blocks.
6. Member/admin cancels reservation when needed.

## 8. MVP Acceptance Criteria
- A new club can be created and managed independently of others.
- Club Admin can create at least one resource with block size configuration.
- Member cannot reserve a resource before access approval.
- Approved member can successfully reserve aligned, non-conflicting blocks.
- Overlapping reservation attempts are rejected with a clear error.
- Reservation cancellation updates availability immediately.

## 9. Decisions from Next Iteration
- Clubs use two roles in MVP (Club Admin and Member), with Club Admin promotion/demotion controls and a minimum of one Club Admin at all times.
- Notifications are skipped for MVP; users check the app directly, with future extensibility for notifications.
- Timezone handling is browser-based per user for MVP (no club-level timezone setting).
- Recurring reservations remain a v2 consideration.
