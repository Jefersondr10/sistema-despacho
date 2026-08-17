import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MobileBipagemDemo } from "./mobile-bipagem-demo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demonstração da bipagem móvel",
  robots: {
    index: false,
    follow: false,
  },
};

export default function DemonstracaoBipagemPage() {
  if (process.env.ENABLE_MOBILE_BIPAGEM_DEMO !== "1") {
    notFound();
  }

  return <MobileBipagemDemo />;
}
