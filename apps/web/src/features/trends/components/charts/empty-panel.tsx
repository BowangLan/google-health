
export function EmptyPanel({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <figure className="viz m-0 [&_+_.viz]:mt-1 viz-empty [&_.viz-note]:[padding:8px_18px_16px]">
      <figcaption className="viz-head flex flex-wrap items-baseline gap-y-1 gap-x-2.5 [padding:12px_18px_2px]">
        <span className="viz-title text-[12px] font-semibold">{title}</span>
      </figcaption>
      <div className="viz-note [padding:2px_18px_6px] text-subtle text-[11.5px]">{message}</div>
    </figure>
  );
}
