import { AppHeader } from "@/components/shell/app-header";
import { ProfileView } from "./profile-view";

export const metadata = { title: "Profile · AI Chess Coach" };

export default function ProfilePage() {
  return (
    <>
      <AppHeader />
      <ProfileView />
    </>
  );
}
