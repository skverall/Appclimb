import Image from "next/image";
import { Search } from "lucide-react";

import type { SourceConnection } from "@/lib/contracts";

const providerAssets: Partial<
  Record<SourceConnection["provider"], { src: string; size: number }>
> = {
  "app-store-connect": {
    src: "/provider-icons/app-store-connect.svg",
    size: 43,
  },
  revenuecat: {
    src: "/provider-icons/revenuecat.svg",
    size: 43,
  },
  posthog: {
    src: "/provider-icons/posthog.svg",
    size: 32,
  },
  superwall: {
    src: "/provider-icons/superwall.svg",
    size: 43,
  },
};

export function ProviderMark({
  provider,
}: {
  provider: SourceConnection["provider"];
}) {
  if (provider === "appclimb-rank") {
    return <Search aria-hidden="true" data-provider-mark={provider} />;
  }

  const asset = providerAssets[provider];
  if (!asset) return null;

  return (
    <Image
      alt=""
      aria-hidden="true"
      data-provider-mark={provider}
      height={asset.size}
      src={asset.src}
      width={asset.size}
    />
  );
}
