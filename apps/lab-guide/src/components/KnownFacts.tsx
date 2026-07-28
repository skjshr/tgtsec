import {
  IconArrowsExchange,
  IconCheck,
  IconDeviceDesktop,
  IconDeviceLaptop,
  IconListCheck,
  IconTargetArrow,
  IconTrendingUp,
} from "@tabler/icons-react";
import type { ExperienceMode, Fact, LabProjection } from "../types";
import { AppIcon } from "./AppIcon";

interface KnownFactsProps {
  facts: Fact[];
  title: string;
  projection?: LabProjection;
  detailed?: boolean;
  experience?: ExperienceMode;
  showHeading?: boolean;
  showContextCards?: boolean;
}

export function KnownFacts({
  facts,
  title,
  projection,
  detailed = false,
  experience = "live",
  showHeading = true,
  showContextCards = true,
}: KnownFactsProps) {
  return (
    <aside className={`known-facts ${detailed ? "known-facts--detailed" : ""}`}>
      {showHeading ? (
        <h2 className="rail-heading">
          <IconListCheck aria-hidden="true" />
          <span className="rail-heading-label">
            {title === "分かっていること" ? (
              <>
                分かっている<wbr />こと
              </>
            ) : (
              title
            )}
          </span>
        </h2>
      ) : null}

      {facts.length > 0 ? (
        <ul className="fact-list">
          {facts.map((fact) => (
            <li className="fact-item" key={fact.id}>
              {detailed ? (
                <span className="fact-check" aria-label="確認済み">
                  <IconCheck aria-hidden="true" />
                </span>
              ) : null}
              <span className="fact-icon">
                <AppIcon name={fact.icon} stroke={1.65} />
              </span>
              <span className="fact-copy">
                <strong>{fact.label}</strong>
                {detailed && fact.detail ? <small>{fact.detail}</small> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="facts-empty">
          <IconTargetArrow aria-hidden="true" />
          <p>まだ発見はありません。</p>
          <small>まず有線接続と標的の入口を確認しましょう。</small>
        </div>
      )}

      {detailed && projection && showContextCards ? (
        <>
          <section className="rail-card objective-card" aria-labelledby="objective-title">
            <IconTargetArrow aria-hidden="true" />
            <div>
              <h3 id="objective-title">現在の目標</h3>
              <p>{projection.objective}</p>
            </div>
          </section>

          {experience === "live" ? (
            <section
              className="rail-card progress-card"
              aria-labelledby="progress-title"
            >
              <IconTrendingUp aria-hidden="true" />
              <div>
                <h3 id="progress-title">セッションの進み具合</h3>
                <p>
                  発見 <strong>{projection.progress.discovered}</strong>
                  <span aria-hidden="true"> / </span>
                  <span className="sr-only">件中</span>
                  {projection.progress.total}
                </p>
                <progress
                  max={projection.progress.total}
                  value={projection.progress.discovered}
                  aria-label={`${projection.progress.total}件中${projection.progress.discovered}件を発見`}
                />
              </div>
            </section>
          ) : (
            <section
              className="rail-card progress-card progress-card--browse"
              aria-labelledby="progress-title"
            >
              <IconTrendingUp aria-hidden="true" />
              <div>
                <h3 id="progress-title">ライブ時の変化</h3>
                <p>発見に合わせて事実、経路、次の選択を更新します。</p>
              </div>
            </section>
          )}

          <div className="direct-connection" aria-label="KaliとDebianを有線で直結">
            <span>
              <IconDeviceLaptop aria-hidden="true" />
              <small>Kali（あなた）</small>
            </span>
            <span className="connection-mark">
              <IconArrowsExchange aria-hidden="true" />
              <small>直結</small>
            </span>
            <span>
              <IconDeviceDesktop aria-hidden="true" />
              <small>Debian（対象）</small>
            </span>
          </div>
        </>
      ) : null}
    </aside>
  );
}
