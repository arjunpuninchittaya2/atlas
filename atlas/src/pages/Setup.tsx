import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import CodeBlock from '../components/CodeBlock'
import ProgressDots from '../components/ProgressDots'
import Spinner from '../components/Spinner'
import { createDatabase, getSetupInfo, verifySetup } from '../lib/api'
import './Setup.css'

type SetupInfoState = {
  apiKey: string
  updateUrl: string
}

const VERIFICATION_TIMEOUT_MS = 180_000
const VERIFICATION_POLL_INTERVAL_MS = 3_000

const SCRIPT_TEMPLATE = `const NOTION_SYNC_API_KEY = "__API_KEY__";
const NOTION_SYNC_URL = "__UPDATE_URL__";
const NOTION_SYNC_ENABLED = true;

function sendClassroomDataWebhook() {
  if (!NOTION_SYNC_ENABLED) {
    console.log("Sync disabled. Set NOTION_SYNC_ENABLED = true to activate.");
    return;
  }

  let payloadData = { courses: [] };

  try {
    let pageToken = null;
    let activeCourses = [];
    do {
      const response = Classroom.Courses.list({
        courseStates: ['ACTIVE'],
        pageToken: pageToken
      });
      if (response.courses) activeCourses = activeCourses.concat(response.courses);
      pageToken = response.nextPageToken;
    } while (pageToken);

    activeCourses.forEach(course => {
      let courseData = {
        id: course.id,
        name: course.name,
        section: course.section || "",
        courseWork: [],
        announcements: []
      };

      try {
        let cwToken = null;
        do {
          const cwRes = Classroom.Courses.CourseWork.list(course.id, { pageToken: cwToken });
          if (cwRes.courseWork) courseData.courseWork = courseData.courseWork.concat(cwRes.courseWork);
          cwToken = cwRes.nextPageToken;
        } while (cwToken);
      } catch(e) { console.warn("Skipping courseWork for " + course.name + ": " + e.message); }

      try {
        let annToken = null;
        do {
          const annRes = Classroom.Courses.Announcements.list(course.id, { pageToken: annToken });
          if (annRes.announcements) courseData.announcements = courseData.announcements.concat(annRes.announcements);
          annToken = annRes.nextPageToken;
        } while (annToken);
      } catch(e) { console.warn("Skipping announcements for " + course.name + ": " + e.message); }

      payloadData.courses.push(courseData);
    });

  } catch(e) {
    console.error("Critical error: " + e.message);
    return;
  }

  const payload = {
    apiKey: NOTION_SYNC_API_KEY,
    courses: payloadData.courses
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(NOTION_SYNC_URL, options);
    console.log("Sync complete: " + response.getContentText());
  } catch(e) {
    console.error("Error sending data: " + e.message);
  }
}`

export default function Setup() {
  const navigate = useNavigate()
  const [activeStep, setActiveStep] = useState(1)
  const [setupInfo, setSetupInfo] = useState<SetupInfoState | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [dbCreating, setDbCreating] = useState(false)
  const [dbResult, setDbResult] = useState<{ databaseId: string; databaseName: string; databaseUrl: string } | null>(null)
  const [dbError, setDbError] = useState<string | null>(null)
  const [showManualDb, setShowManualDb] = useState(false)
  const [manualDbId, setManualDbId] = useState('')
  const [verified, setVerified] = useState(false)
  const [verifyTimeout, setVerifyTimeout] = useState(false)

  useEffect(() => {
    getSetupInfo()
      .then((response) => setSetupInfo(response))
      .catch(() => setSetupInfo(null))
      .finally(() => setLoadingInfo(false))
  }, [])

  useEffect(() => {
    if (activeStep !== 3 || verified) {
      return
    }

    const startedAt = Date.now()
    const interval = window.setInterval(() => {
      verifySetup()
        .then((response) => {
          if (response.verified) {
            setVerified(true)
            window.clearInterval(interval)
          }

          if (Date.now() - startedAt > VERIFICATION_TIMEOUT_MS) {
            setVerifyTimeout(true)
            window.clearInterval(interval)
          }
        })
        .catch(() => {
          if (Date.now() - startedAt > VERIFICATION_TIMEOUT_MS) {
            setVerifyTimeout(true)
            window.clearInterval(interval)
          }
        })
    }, VERIFICATION_POLL_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [activeStep, verified])

  const script = useMemo(() => {
    if (!setupInfo) return ''

    return SCRIPT_TEMPLATE
      .replace('__API_KEY__', setupInfo.apiKey)
      .replace('__UPDATE_URL__', setupInfo.updateUrl)
  }, [setupInfo])

  const handleCreateDb = async (databaseId?: string) => {
    setDbError(null)
    setDbCreating(true)

    try {
      const result = await createDatabase(databaseId)
      setDbResult(result)
      window.setTimeout(() => setActiveStep(2), 1500)
    } catch (error) {
      setDbError(error instanceof Error ? error.message : 'Failed to create database.')
    } finally {
      setDbCreating(false)
    }
  }

  if (loadingInfo) {
    return <Spinner label='Loading setup…' />
  }

  if (!setupInfo) {
    return (
      <div className='centered-message'>
        <p>Unable to load setup details.</p>
        <Link to='/'>Back to home</Link>
      </div>
    )
  }

  return (
    <main className='setup-page'>
      <ProgressDots activeStep={activeStep} />

      <section className='setup-card'>
        {activeStep === 1 && (
          <>
            <h1>Create your assignments database</h1>
            <p>ATLAS creates a Notion database in your workspace and configures it with the fields needed for syncing.</p>
            <button
              type='button'
              className='btn-primary'
              onClick={() => handleCreateDb()}
              disabled={dbCreating}
            >
              {dbCreating ? 'Creating…' : 'Create Database'}
            </button>

            <button
              type='button'
              className='btn-link'
              onClick={() => setShowManualDb((value) => !value)}
            >
              Already have a database?
            </button>

            {showManualDb && (
              <div className='manual-db'>
                <input
                  value={manualDbId}
                  onChange={(event) => setManualDbId(event.target.value)}
                  placeholder='Paste database ID'
                />
                <button
                  type='button'
                  className='btn-primary'
                  disabled={!manualDbId || dbCreating}
                  onClick={() => handleCreateDb(manualDbId)}
                >
                  Save Database
                </button>
              </div>
            )}

            {dbResult && (
              <p className='success-line'>
                <Check size={16} />
                <a href={dbResult.databaseUrl} target='_blank' rel='noreferrer'>
                  {dbResult.databaseName}
                </a>
              </p>
            )}

            {dbError && <p className='error-line'>{dbError}</p>}
          </>
        )}

        {activeStep === 2 && (
          <>
            <h1>Install the sync script</h1>
            <p>This script runs in your Google account and sends your Classroom data to ATLAS.</p>
            <ol>
              <li>Go to script.google.com and create a new project</li>
              <li>Delete all existing code and paste the script below</li>
              <li>Click Run → approve Google permissions</li>
              <li>Click Triggers → Add Trigger → sendClassroomDataWebhook → Time-driven → Hour timer → Every hour</li>
            </ol>

            <CodeBlock code={script} />

            <button type='button' className='btn-primary' onClick={() => setActiveStep(3)}>
              I&apos;ve run the script →
            </button>
          </>
        )}

        {activeStep === 3 && (
          <>
            <h1>{verified ? 'Connected.' : 'Waiting for first sync…'}</h1>
            <p>
              {verified
                ? 'Your first assignments have been synced to Notion.'
                : 'Run the script once in Apps Script to verify everything is working.'}
            </p>

            <div className='verify-state'>
              <span className={`verify-dot ${verified ? 'done' : 'pulse'}`} />
            </div>

            {verifyTimeout && !verified && (
              <p className='timeout-line'>
                Taking longer than expected. Check the Apps Script execution log for errors.
                {' '}
                <a href='https://script.google.com/' target='_blank' rel='noreferrer'>
                  Open script.google.com
                </a>
              </p>
            )}

            {verified && (
              <button type='button' className='btn-primary' onClick={() => navigate('/dashboard')}>
                Go to dashboard →
              </button>
            )}
          </>
        )}
      </section>
    </main>
  )
}
