import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ScrollProgress } from "@/components/layout/ScrollProgress";

/**
 * Marketing chrome — the floating navbar, read-progress bar, and premium footer
 * wrap every public page. The app and auth groups deliberately omit all of this.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScrollProgress />
      <Navbar />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
