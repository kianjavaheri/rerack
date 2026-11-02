import { Link } from 'react-router-dom';
import { HOME_PATH } from '../config';

export function NotFound() {
  return (
    <div className="empty">
      This item no longer exists.{' '}
      <Link to={HOME_PATH} className="link-cta" style={{ fontSize: 12, marginLeft: 8 }}>
        Go home
      </Link>
    </div>
  );
}
