// Teamver slide-only Home: wordmark + previous subtitle, then a single CTA
// that opens the create wizard. Replaces the OD freeform HomeHero composer
// on embed (slideOnlyMvp) without changing the brand lockup.

import { Icon } from "../../components/Icon";
import { TeamverLogo } from "../branding/TeamverLogo";
import { useBrandLabel } from "../branding/useBrandLabel";
import { useTeamverT } from "../branding/useTeamverT";

type Props = {
  onCreate: () => void;
  disabled?: boolean;
};

export function TeamverHomeCreateHero({ onCreate, disabled }: Props) {
  const t = useTeamverT();
  const brandLabel = useBrandLabel();
  return (
    <section
      className="home-hero teamver-home-create-hero"
      data-testid="teamver-home-create-hero"
    >
      <div className="home-hero__brand" aria-hidden>
        <TeamverLogo variant="wordmark" className="home-hero__brand-logo" height={112} />
      </div>
      <h1 className="sr-only">{brandLabel}</h1>
      <p className="home-hero__subtitle">{t("teamver.homeHero.subtitle")}</p>
      <button
        type="button"
        className="teamver-home-create-hero-cta"
        data-testid="teamver-home-create-cta"
        disabled={disabled}
        onClick={onCreate}
      >
        <span className="teamver-home-create-hero-cta-icon" aria-hidden>
          <Icon name="plus" size={16} strokeWidth={2.4} />
        </span>
        {t("teamver.homeCreate.cta")}
      </button>
    </section>
  );
}
