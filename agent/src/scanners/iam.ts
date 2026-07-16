import {
  IAMClient,
  ListUsersCommand,
  ListMFADevicesCommand,
  ListAccessKeysCommand,
  ListAttachedUserPoliciesCommand,
  GetAccountPasswordPolicyCommand,
  GetAccountSummaryCommand,
} from "@aws-sdk/client-iam";
import type { Finding } from "../types.js";

const KEY_MAX_AGE_DAYS = 90;

// IAM is a global service; region is nominal.
export async function scanIam(region: string): Promise<Finding[]> {
  const iam = new IAMClient({ region });
  const findings: Finding[] = [];

  // --- Per-user checks: MFA, access-key age, admin policy ---
  let marker: string | undefined;
  do {
    const page = await iam.send(new ListUsersCommand({ Marker: marker }));
    for (const u of page.Users || []) {
      const userName = u.UserName!;

      const mfa = await iam.send(
        new ListMFADevicesCommand({ UserName: userName })
      );
      if ((mfa.MFADevices || []).length === 0) {
        findings.push({
          id: `iam.no_mfa:${userName}`,
          check: "iam.no_mfa",
          severity: "high",
          title: `IAM user "${userName}" has no MFA`,
          resource: u.Arn || userName,
          detail:
            "This user can authenticate with a password alone. A leaked or phished password is enough to take over the account.",
          manualFix: `Assign an MFA device: aws iam enable-mfa-device --user-name ${userName} --serial-number <arn> --authentication-code1 <c1> --authentication-code2 <c2>`,
          // Not one-click fixable: enrolling an MFA device requires the user's
          // physical device / TOTP codes.
        });
      }

      const keys = await iam.send(
        new ListAccessKeysCommand({ UserName: userName })
      );
      for (const k of keys.AccessKeyMetadata || []) {
        if (k.Status !== "Active" || !k.CreateDate) continue;
        const ageDays =
          (Date.now() - k.CreateDate.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > KEY_MAX_AGE_DAYS) {
          findings.push({
            id: `iam.old_key:${userName}:${k.AccessKeyId}`,
            check: "iam.old_key",
            severity: "medium",
            title: `Access key for "${userName}" is ${Math.floor(ageDays)} days old`,
            resource: k.AccessKeyId!,
            detail: `Long-lived keys widen the window for a leaked credential to be abused. Rotate keys at least every ${KEY_MAX_AGE_DAYS} days.`,
            manualFix: `Rotate then deactivate: create a new key, update your apps, then: aws iam update-access-key --user-name ${userName} --access-key-id ${k.AccessKeyId} --status Inactive`,
            remediation: {
              action: "deactivate_access_key",
              params: { userName, accessKeyId: k.AccessKeyId! },
              effect: `Deactivate access key ${k.AccessKeyId} for user ${userName}. Reversible — you can reactivate it. Make sure nothing is still using it.`,
            },
          });
        }
      }

      const attached = await iam.send(
        new ListAttachedUserPoliciesCommand({ UserName: userName })
      );
      const admin = (attached.AttachedPolicies || []).find(
        (p) => p.PolicyName === "AdministratorAccess"
      );
      if (admin) {
        findings.push({
          id: `iam.admin_user:${userName}`,
          check: "iam.admin_user",
          severity: "medium",
          title: `IAM user "${userName}" has AdministratorAccess attached directly`,
          resource: u.Arn || userName,
          detail:
            "Directly-attached full admin on a user is broad standing privilege. Prefer scoped roles assumed on demand.",
          manualFix: `Detach and replace with a scoped policy/role: aws iam detach-user-policy --user-name ${userName} --policy-arn arn:aws:iam::aws:policy/AdministratorAccess`,
        });
      }
    }
    marker = page.IsTruncated ? page.Marker : undefined;
  } while (marker);

  // --- Account-level checks ---
  try {
    await iam.send(new GetAccountPasswordPolicyCommand({}));
  } catch (err: unknown) {
    if (isNoSuchEntity(err)) {
      findings.push({
        id: "iam.no_password_policy",
        check: "iam.no_password_policy",
        severity: "medium",
        title: "Account has no IAM password policy",
        resource: "account:password-policy",
        detail:
          "Without a password policy there is no minimum length, complexity, or rotation requirement for IAM users.",
        manualFix:
          "Set one, e.g.: aws iam update-account-password-policy --minimum-password-length 14 --require-symbols --require-numbers --require-uppercase-characters --require-lowercase-characters",
      });
    }
  }

  const summary = await iam.send(new GetAccountSummaryCommand({}));
  const map = summary.SummaryMap || {};
  if (map.AccountAccessKeysPresent && map.AccountAccessKeysPresent > 0) {
    findings.push({
      id: "iam.root_access_keys",
      check: "iam.root_access_keys",
      severity: "critical",
      title: "Root account has access keys",
      resource: "account:root",
      detail:
        "Root access keys grant unrestricted, unconditional access and cannot be scoped. They should never exist.",
      manualFix:
        "Delete root access keys from the Security Credentials page of the root user (cannot be done via IAM user credentials).",
    });
  }
  if (map.AccountMFAEnabled !== undefined && map.AccountMFAEnabled === 0) {
    findings.push({
      id: "iam.root_no_mfa",
      check: "iam.root_no_mfa",
      severity: "critical",
      title: "Root account has no MFA",
      resource: "account:root",
      detail:
        "The root user can do anything in the account. Without MFA a single leaked root password is a full compromise.",
      manualFix:
        "Enable MFA on the root user from the Security Credentials page while signed in as root.",
    });
  }

  return findings;
}

function isNoSuchEntity(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: string }).name === "NoSuchEntity"
  );
}
