import { SignIn2 } from "@/components/ui/clean-minimal-sign-in";

/** Standalone demo of the clean sign-in card (no auth wiring). */
const Demo = () => {
  return (
    <SignIn2
      onSubmit={async () => {
        /* demo only */
      }}
    />
  );
};

export { Demo };
