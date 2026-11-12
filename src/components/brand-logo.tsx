import Image from "next/image";

export function BrandLogo() {
  return (
    <>
      <Image
        alt=""
        className="brand-logo"
        src="/images/stream-talents-logo.gif"
        width={384}
        height={216}
        unoptimized
        loading="eager"
      />
      <span className="brand-logo-static" aria-hidden="true">
        Stream Talents
      </span>
    </>
  );
}
