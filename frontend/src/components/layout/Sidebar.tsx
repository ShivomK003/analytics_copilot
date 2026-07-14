import { NavLink } from "react-router-dom";
import { navigationItems } from "../../config/navigation";

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        <div className="brand-block">
          <p className="brand-kicker">Research dashboard</p>
          <NavLink className="brand-link" to="/overview">
            <span>AI Research</span>
            <span>Intelligence Copilot</span>
          </NavLink>
        </div>

        <nav aria-label="Primary" className="sidebar-nav">
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
          <p className="sidebar-footer-label">Foundation status</p>
          <p>
            Frontend shell is in place. Live backend connection and dashboard
            analytics are intentionally deferred to Phase C.
          </p>
        </div>
      </div>
    </aside>
  );
}
