import { resolveMarketplaceBrand } from "@/app/_lib/marketplace-brand";

const MARK_CLASS_NAME =
  "marketplace-brand-mark h-12 w-full max-w-56 print:h-10 print:max-w-48";

function AmazonMark({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 220 70"
      className={MARK_CLASS_NAME}
      role="img"
      aria-label={`${label}, marketplace`}
    >
      <title>{label}</title>
      <text
        x="110"
        y="40"
        fill="#131921"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="42"
        fontWeight="700"
        letterSpacing="-2"
        textAnchor="middle"
      >
        amazon
      </text>
      <path
        d="M52 49c31 18 75 20 113 2"
        fill="none"
        stroke="#ff9900"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <path
        d="m158 49 10 1-4 9"
        fill="none"
        stroke="#ff9900"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />
    </svg>
  );
}

function MercadoLivreMark({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 260 72"
      className={MARK_CLASS_NAME}
      role="img"
      aria-label={`${label}, marketplace`}
    >
      <title>{label}</title>
      <circle cx="36" cy="36" r="31" fill="#ffe600" />
      <path
        d="M17 37c6-8 13-12 19-6 6-6 13-2 19 6-6 8-13 12-19 6-6 6-13 2-19-6Z"
        fill="none"
        stroke="#2d3277"
        strokeLinejoin="round"
        strokeWidth="3.5"
      />
      <path
        d="m27 36 6 5 12-11"
        fill="none"
        stroke="#2d3277"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.5"
      />
      <text
        x="78"
        y="32"
        fill="#2d3277"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="25"
        fontWeight="700"
      >
        mercado
      </text>
      <text
        x="78"
        y="56"
        fill="#2d3277"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="25"
        fontWeight="700"
      >
        livre
      </text>
    </svg>
  );
}

function ShopeeMark({ label }: { label: string }) {
  return (
    <svg
      viewBox="0 0 230 72"
      className={MARK_CLASS_NAME}
      role="img"
      aria-label={`${label}, marketplace`}
    >
      <title>{label}</title>
      <path
        d="M12 24h45l-3 39H15l-3-39Z"
        fill="#ee4d2d"
        stroke="#ee4d2d"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M23 25v-5c0-8 5-13 11-13s11 5 11 13v5"
        fill="none"
        stroke="#ee4d2d"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <text
        x="34.5"
        y="53"
        fill="white"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="30"
        fontWeight="700"
        textAnchor="middle"
      >
        S
      </text>
      <text
        x="70"
        y="51"
        fill="#ee4d2d"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="38"
        fontWeight="700"
      >
        Shopee
      </text>
    </svg>
  );
}

export function MarketplaceBrandMark({ name }: { name: string }) {
  const label = name.trim() || "Não informado";
  const brand = resolveMarketplaceBrand(label);

  if (brand === "amazon") {
    return <AmazonMark label={label} />;
  }

  if (brand === "mercado-livre") {
    return <MercadoLivreMark label={label} />;
  }

  if (brand === "shopee") {
    return <ShopeeMark label={label} />;
  }

  return (
    <span className="break-words text-lg font-extrabold leading-tight text-teal-950 sm:text-xl print:text-lg">
      {label}
    </span>
  );
}
