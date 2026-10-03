import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useTabSession, type TabSession } from "@/lib/use-tab-session";

const SNAPSHOT: TabSession = {
  username: "snapshot-user",
  preferredUsername: "snapshot-user",
  email: "snapshot@example.com",
  roles: ["HDAB_AUTHORITY"],
};

describe("useTabSession", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  // #447: the server has no sessionStorage, so its render has no snapshot.
  // A first client render that read the snapshot drew a different navigation,
  // and React threw #418 on every signed-in page.
  it("does not read the snapshot during the first render", async () => {
    sessionStorage.setItem("tab-session-snapshot", JSON.stringify(SNAPSHOT));
    const renders: (string | null)[] = [];

    function Probe() {
      const { session } = useTabSession();
      renders.push(session?.username ?? null);
      return <span>{session?.username ?? "none"}</span>;
    }

    render(<Probe />);

    expect(renders[0]).toBeNull();
    // The mount effect then loads it, so the tab still keeps its own user.
    expect(await screen.findByText("snapshot-user")).toBeInTheDocument();
  });
});
