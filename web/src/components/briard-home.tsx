import { CloudOff, WifiOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { savedAtLabel } from "@/lib/format";
import { BriardMark } from "@/components/briard-mark";
import { t } from "@/lib/i18n";
import { useOperatorBusy } from "@/lib/busy";
import { useLocale } from "@/hooks/use-locale";

interface BriardHomeProps {
  /** Return to the dashboard. */
  onHome?: () => void;
  /** The connection has been unavailable for a sustained beat. */
  trouble: boolean;
  /** The outage has passed the escalation threshold. */
  lost?: boolean;
  /** Selects the bridge-unreachable or phone-offline badge. */
  online?: boolean;
  /** Time of the last live reading, included in the accessible name when lost. */
  lastSeenAt?: number;
  className?: string;
}

export function BriardHome({
  onHome,
  trouble,
  lost = false,
  online = true,
  lastSeenAt,
  className,
}: BriardHomeProps) {
  useLocale();
  const bloom = trouble && !lost;
  const LostIcon = online ? CloudOff : WifiOff;

  const busy = useOperatorBusy();
  return (
    <button
      type="button"
      onClick={onHome}
      // Keep the connection state available to screen-reader users.
      aria-label={
        !trouble
          ? t("nav.home.aria.default")
          : !lost
            ? t("nav.home.aria.reconnecting")
            : lastSeenAt === undefined
              ? t("nav.home.aria.lost")
              : t("nav.home.aria.lostAt", { time: savedAtLabel(lastSeenAt) })
      }
      className={cn(
        "-mx-1 flex items-center rounded px-1 transition-opacity active:opacity-70",
        className,
      )}
    >
      <span data-slot="briard-mark" className="relative grid size-11 shrink-0 place-items-center">
        <BriardMark
          size={40}
          weight="header"
          loading={bloom || (busy && !lost)}
          paper="var(--band-ground)"
          className={cn("transition-opacity", lost && "opacity-40 grayscale")}
        />
        
        {lost ? (
          <LostIcon
            data-slot="briard-lost-badge"
            data-icon={online ? "cloud-off" : "wifi-off"}
            aria-hidden
            className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full bg-band-ground p-px text-status-blocked ring-2 ring-band-ground"
          />
        ) : null}
      </span>
    </button>
  );
}
