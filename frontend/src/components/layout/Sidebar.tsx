import { NavLink } from "react-router-dom";
import { navigationItems } from "../../config/navigation";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        <div className="brand-block">
          <p className="brand-kicker">AI research intelligence</p>
          <NavLink className="brand-link" to="/overview">
            <span>AI Research</span>
            <span>Intelligence Copilot</span>
          </NavLink>
        </div>

        <nav aria-label="Primary" className="sidebar-nav">
          <p className="sidebar-group-label">Workspace</p>
          <ul className="nav-list">
            {navigationItems.map(({ icon: Icon, label, path }) => (
              <li key={path}>
                <NavLink
                  className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
                  to={path}
                >
                  <Icon aria-hidden="true" size={18} />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-footer-label">System status</p>
          <p>Tracking research activity across the dashboard shell while live metrics come online next.</p>
          <div className="sidebar-footer-chips" aria-label="System highlights">
            <span className="sidebar-chip">Tracking 6 AI domains</span>
            <span className="sidebar-chip">Updated daily via pipeline</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
