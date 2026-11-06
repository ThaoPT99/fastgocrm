import { getCrmIdentity } from "./crm-auth";
import Dashboard from "./dashboard";
import PasscodeLogin from "./passcode-login";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCrmIdentity();
  if (!user) return <PasscodeLogin />;
  return <Dashboard name={user.displayName} />;
}
