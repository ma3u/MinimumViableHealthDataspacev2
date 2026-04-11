/**
 * Unit tests for PageIntro component
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookOpen, Home } from "lucide-react";
import PageIntro from "@/components/PageIntro";

// Mock next/link to render a plain anchor
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("PageIntro", () => {
  it("should render the title", () => {
    render(
      <PageIntro title="Catalog Browser" description="Browse datasets." />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Catalog Browser",
    );
  });

  it("should render the description", () => {
    render(
      <PageIntro
        title="Catalog"
        description="Explore available datasets in the dataspace."
      />,
    );
    expect(
      screen.getByText("Explore available datasets in the dataspace."),
    ).toBeInTheDocument();
  });

  it("should render with only required props", () => {
    render(<PageIntro title="Minimal" description="Just the basics." />);
    expect(screen.getByText("Minimal")).toBeInTheDocument();
    // No step links, no info button
    expect(screen.queryByText("How does this work?")).not.toBeInTheDocument();
  });

  it("should render the icon when provided", () => {
    // icon prop is accepted for API compatibility but not rendered in the
    // Stitch layout — verify the component renders without crashing
    render(<PageIntro title="Home" description="Welcome." icon={Home} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Home");
  });

  it("should show previous step link", () => {
    render(
      <PageIntro
        title="Step 2"
        description="Second step."
        prevStep={{ href: "/step-1", label: "Back to Step 1" }}
      />,
    );
    const link = screen.getByText("Back to Step 1").closest("a");
    expect(link).toHaveAttribute("href", "/step-1");
  });

  it("should show next step link", () => {
    render(
      <PageIntro
        title="Step 1"
        description="First step."
        nextStep={{ href: "/step-2", label: "Continue to Step 2" }}
      />,
    );
    const link = screen.getByText("Continue to Step 2").closest("a");
    expect(link).toHaveAttribute("href", "/step-2");
  });

  it("should show both prev and next step links with separator", () => {
    render(
      <PageIntro
        title="Middle Step"
        description="In the middle."
        prevStep={{ href: "/prev", label: "Previous" }}
        nextStep={{ href: "/next", label: "Next" }}
      />,
    );
    expect(screen.getByText("Previous")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
    // Separator is a middle dot (·) in the Stitch layout
    expect(screen.getByText("·")).toBeInTheDocument();
  });

  it("should toggle info callout on click", async () => {
    const user = userEvent.setup();

    render(
      <PageIntro
        title="Test"
        description="Desc."
        infoText="This explains how it works."
      />,
    );

    // Initially collapsed
    expect(screen.getByText("How does this work?")).toBeInTheDocument();
    expect(
      screen.queryByText("This explains how it works."),
    ).not.toBeInTheDocument();

    // Open
    await user.click(screen.getByText("How does this work?"));
    await waitFor(() => {
      expect(
        screen.getByText("This explains how it works."),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Hide details")).toBeInTheDocument();

    // Close
    await user.click(screen.getByText("Hide details"));
    await waitFor(() => {
      expect(
        screen.queryByText("This explains how it works."),
      ).not.toBeInTheDocument();
    });
  });

  it("should show doc link inside expanded callout", async () => {
    const user = userEvent.setup();

    render(
      <PageIntro
        title="Docs"
        description="With docs."
        docLink={{ href: "/docs/guide", label: "Read the guide" }}
      />,
    );

    await user.click(screen.getByText("How does this work?"));
    await waitFor(() => {
      const link = screen.getByText("Read the guide").closest("a");
      expect(link).toHaveAttribute("href", "/docs/guide");
    });
  });

  it("should render external doc link with target _blank", async () => {
    const user = userEvent.setup();

    render(
      <PageIntro
        title="External"
        description="External link."
        docLink={{
          href: "https://example.com/docs",
          label: "External docs",
          external: true,
        }}
      />,
    );

    await user.click(screen.getByText("How does this work?"));
    await waitFor(() => {
      const link = screen.getByText("External docs").closest("a");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  it("should show info callout button when only docLink is provided", () => {
    render(
      <PageIntro
        title="Doc Only"
        description="No info text."
        docLink={{ href: "/docs", label: "Docs" }}
      />,
    );
    expect(screen.getByText("How does this work?")).toBeInTheDocument();
  });

  it("should render both infoText and docLink in expanded callout", async () => {
    const user = userEvent.setup();

    render(
      <PageIntro
        title="Full"
        description="Everything."
        infoText="Detailed explanation here."
        docLink={{ href: "/docs/full", label: "Full documentation" }}
      />,
    );

    await user.click(screen.getByText("How does this work?"));
    await waitFor(() => {
      expect(
        screen.getByText("Detailed explanation here."),
      ).toBeInTheDocument();
      expect(screen.getByText("Full documentation")).toBeInTheDocument();
    });
  });

  it("should render with a custom icon component", () => {
    // icon prop is accepted for API compatibility but not rendered in the
    // Stitch layout — verify the component renders title and description
    render(<PageIntro title="Library" description="Books." icon={BookOpen} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Library",
    );
    expect(screen.getByText("Books.")).toBeInTheDocument();
  });
});
