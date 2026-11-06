type WorkItem = {
  id: string;
  title: string;
  detail: string;
  badge?: string;
  urgent?: boolean;
  open: () => void;
};

export default function SalesQueue({ title, empty, items }: { title: string; empty: string; items: WorkItem[] }) {
  return <section className="panel salesQueue">
    <div className="sectionHead"><h2>{title}</h2><span className="pill">{items.length}</span></div>
    {items.length ? <ul>{items.map((item) => <li key={item.id}>
      <button className="salesQueueItem" onClick={item.open}>
        <span><strong>{item.title}</strong><small>{item.detail}</small></span>
        {item.badge && <span className={item.urgent ? "pill danger" : "pill"}>{item.badge}</span>}
      </button>
    </li>)}</ul> : <p className="empty">{empty}</p>}
  </section>;
}
