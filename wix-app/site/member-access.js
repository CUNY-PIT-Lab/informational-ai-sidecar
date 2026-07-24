/**
 * Wix master-page code for one member access control in the top header.
 *
 * Add these Wix elements to the header:
 *   #createAccountLink  text: Create an Account
 *   #memberDivider      text: |
 *   #signInLink         text: Sign In
 *   #memberProfileLink  text: Profile
 *
 * Delete any duplicate account control from the page body.
 */
import { authentication, currentMember } from "wix-members-frontend";

function showSignedOut() {
  $w("#memberProfileLink").collapse();
  $w("#createAccountLink").expand();
  $w("#memberDivider").expand();
  $w("#signInLink").expand();
}

function showProfile(member) {
  const slug = String(member?.profile?.slug || "").trim();
  $w("#createAccountLink").collapse();
  $w("#memberDivider").collapse();
  $w("#signInLink").collapse();
  $w("#memberProfileLink").link = slug ? `/profile/${encodeURIComponent(slug)}/profile` : "/account/my-account";
  $w("#memberProfileLink").expand();
}

async function refreshMemberAccess() {
  try {
    const member = await currentMember.getMember();
    if (member) {
      showProfile(member);
      return;
    }
  } catch {
    // A signed-out visitor has no current member record.
  }
  showSignedOut();
}

$w.onReady(() => {
  $w("#createAccountLink").onClick(() => {
    authentication.promptLogin({ mode: "signup", modal: true }).then(refreshMemberAccess).catch(() => {});
  });
  $w("#signInLink").onClick(() => {
    authentication.promptLogin({ mode: "login", modal: true }).then(refreshMemberAccess).catch(() => {});
  });
  refreshMemberAccess();
});
