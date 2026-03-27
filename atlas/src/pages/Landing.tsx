import { Link } from 'react-router-dom'
import './Landing.css'

export default function Landing() {
  return (
    <main className='landing'>
      <section className='hero'>
        <h1>
          Your assignments.
          <br />
          In Notion.
        </h1>
        <p>Sync Google Classroom coursework and announcements into your Notion workspace automatically.</p>
        <Link to='/auth' className='btn-primary'>
          Connect Notion →
        </Link>
        <small>Free. No account required. Works with any Notion workspace.</small>
      </section>

      <section className='how-it-works'>
        {[
          ['1', 'Connect your Notion workspace', 'Authorize ATLAS to create and update your assignments database.'],
          ['2', 'Copy a script into Google Apps Script', 'Paste one script once to connect your Classroom data feed.'],
          ['3', 'Assignments sync automatically', 'New and updated coursework appears in your Notion database every hour.'],
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
        <a href='https://developers.notion.com/' target='_blank' rel='noreferrer'>
          Notion integration docs
        </a>
      </footer>
    </main>
  )
}
