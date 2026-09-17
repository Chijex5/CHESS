import { AppShell } from "@/components/shell/app-shell";
import { ProfileView } from "./profile-view";

export const metadata = { title: "Profile · AI Chess Coach" };

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileView />
    </AppShell>
  );
}
