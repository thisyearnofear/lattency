import { createClient } from "@base44/sdk";

const base44 = createClient({
  appId: process.env.NEXT_PUBLIC_BASE44_APP_ID!,
});

export default base44;
