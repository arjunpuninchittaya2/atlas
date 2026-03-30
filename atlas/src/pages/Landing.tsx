import { Link } from 'react-router-dom'
import './Landing.css'

export default function Landing() {
  return (
    <main className='landing'>
      <section className='hero'>
        <h1>
          Your school work.
          <br />
          Organized.
        </h1>
        <p>Manage your assignments, courses, and schedule all in one place.</p>
        <Link to='/login' className='btn-primary'>
          Get Started →
        </Link>
        <small>Free. Simple productivity for students.</small>
      </section>

      <section className='how-it-works'>
        {[
          ['1', 'Create an account', 'Sign up with your email in seconds.'],
          ['2', 'Add your courses', 'Organize your classes and track assignments.'],
          ['3', 'Stay on top of deadlines', 'Never miss an assignment with a clean, simple dashboard.'],
        ].map(([number, title, body]) => (
          <article key={number} className='step-card'>
            <div className='step-number'>{number}</div>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <footer>
        <span>© {new Date().getFullYear()} ATLAS</span>
      </footer>
    </main>
  )
}
