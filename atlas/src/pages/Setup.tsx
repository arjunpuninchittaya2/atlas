import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { completeSetup, getProfile, verifyInitialSync } from '@/lib/new-api'
import { getApiKey, isAuthenticated } from '@/lib/storage'
import ProgressDots from '@/components/ProgressDots'
import CodeBlock from '@/components/CodeBlock'
import './Setup.css'

function buildAppsScriptTemplate(atlasApiKey: string, atlasSyncUrl: string) {
  return `const ATLAS_SYNC_API_KEY = "${atlasApiKey}";
const ATLAS_SYNC_URL = "${atlasSyncUrl}";
const ATLAS_SYNC_ENABLED = true;

function sendClassroomDataWebhook(syncMode) {
  if (!ATLAS_SYNC_ENABLED) {
    console.log("Sync disabled.");
    return;
  }

  let payloadData = { courses: [] };

  try {
    let pageToken = null;
    let activeCourses = [];

    // Fetch courses
    do {
      const response = Classroom.Courses.list({
        courseStates: ['ACTIVE'],
        pageToken: pageToken
      });

      if (response.courses) {
        activeCourses = activeCourses.concat(response.courses);
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    // Process each course
    activeCourses.forEach(course => {
      let courseData = {
        id: course.id,
        name: course.name,
        section: course.section || "",
        courseWork: [],
        announcements: []
      };

      // ---- COURSEWORK ----
      try {
        let cwToken = null;

        do {
          const cwRes = Classroom.Courses.CourseWork.list(course.id, {
            pageToken: cwToken,
            courseWorkStates: ["PUBLISHED"]
          });

          if (cwRes && cwRes.courseWork) {
            courseData.courseWork = courseData.courseWork.concat(cwRes.courseWork);
          }

          cwToken = cwRes.nextPageToken;
        } while (cwToken);

      } catch (e) {
        console.warn(
          "CourseWork error for " + course.name + ": " +
          JSON.stringify(e)
        );
      }

      // ---- ANNOUNCEMENTS ----
      try {
        let annToken = null;

        do {
          const annRes = Classroom.Courses.Announcements.list(course.id, {
            pageToken: annToken
          });

          if (annRes && annRes.announcements) {
            courseData.announcements = courseData.announcements.concat(annRes.announcements);
          }

          annToken = annRes.nextPageToken;
        } while (annToken);

      } catch (e) {
        console.warn(
          "Announcements error for " + course.name + ": " +
          JSON.stringify(e)
        );
      }

      payloadData.courses.push(courseData);
    });

  } catch (e) {
    console.error("Critical error: " + JSON.stringify(e));
    return;
  }

  const payload = {
    apiKey: ATLAS_SYNC_API_KEY,
    syncMode: syncMode || "queued",
    courses: payloadData.courses
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(ATLAS_SYNC_URL, options);
    const status = response.getResponseCode();
    const raw = response.getContentText();

    let body = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch (parseError) {
      console.error("Non-JSON response (" + status + "): " + raw);
      return;
    }

    if (status >= 400) {
      console.error("ATLAS sync error (" + status + "): " + JSON.stringify(body));
      return;
    }

    console.log("Sync complete.");
    console.log("Courses created: " + (body.coursesCreated || 0));
    console.log("Assignments synced: " + (body.assignmentsSynced || 0));

  } catch (e) {
    console.error("Error sending data: " + JSON.stringify(e));
  }
}

function runInitialSync() {
  sendClassroomDataWebhook("client");
}

function createHourlySyncTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "runInitialSync")
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("runInitialSync")
    .timeBased()
    .everyHours(1)
    .create();

  console.log("Hourly trigger created.");
}`
}

export default function Setup() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [checklistConfirmed, setChecklistConfirmed] = useState(false)
  const [healthVerified, setHealthVerified] = useState(false)
  const [initialSyncVerified, setInitialSyncVerified] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [syncDetails, setSyncDetails] = useState<string | null>(null)
  const [syncCounts, setSyncCounts] = useState<{ courses: number; assignments: number }>({
    courses: 0,
    assignments: 0,
  })

  const redirectTarget = searchParams.get('redirect') || '/dashboard'

  const setupStep = useMemo(() => {
    if (!healthVerified) return 1
    if (!initialSyncVerified) return 2
    return 3
  }, [healthVerified, initialSyncVerified])

  const appsScriptTemplate = useMemo(() => {
    const atlasApiKey = getApiKey() || 'PASTE_YOUR_ATLAS_API_KEY_HERE'
    const atlasSyncUrl = `${window.location.origin}/update`
    return buildAppsScriptTemplate(atlasApiKey, atlasSyncUrl)
  }, [])

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate(`/login?redirect=${encodeURIComponent('/setup')}`)
      return
    }

    ;(async () => {
      try {
        const profile = await getProfile()
        if (profile.user.setupCompleted) {
          navigate(redirectTarget)
          return
        }

        const healthResponse = await fetch('/health')
        setHealthVerified(healthResponse.ok)

        const sync = await verifyInitialSync()
        setInitialSyncVerified(sync.verified)
        setLastSyncAt(sync.lastSyncAt)
        setSyncDetails(sync.details)
        setSyncCounts({ courses: sync.courses, assignments: sync.assignments })
      } catch {
        navigate(`/login?redirect=${encodeURIComponent('/setup')}`)
        return
      } finally {
        setLoading(false)
      }
    })()
  }, [navigate, redirectTarget])

  const handleFinishSetup = async () => {
    if (!initialSyncVerified) {
      setError('Run your script initial sync first, then click Verify Initial Sync')
      return
    }
    if (!checklistConfirmed) {
      setError('Please confirm all setup checklist items')
      return
    }

    setSaving(true)
    setError('')
    try {
      await completeSetup({ checklistConfirmed: true })
      navigate(redirectTarget)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete setup')
    } finally {
      setSaving(false)
    }
  }

  const handleVerifyInitialSync = async () => {
    setError('')
    try {
      const sync = await verifyInitialSync()
      setInitialSyncVerified(sync.verified)
      setLastSyncAt(sync.lastSyncAt)
      setSyncDetails(sync.details)
      setSyncCounts({ courses: sync.courses, assignments: sync.assignments })

      if (!sync.verified) {
        setError('No initial sync found yet. Run runInitialSync() in Apps Script, then verify again.')
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify initial sync')
      setInitialSyncVerified(false)
    }
  }

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background'>
        <Loader2 className='w-5 h-5 animate-spin text-neutral-400' />
      </div>
    )
  }

  return (
    <div className='setup-page bg-background'>
      <Card className='setup-card w-full max-w-3xl'>
        <CardHeader>
          <CardTitle className='text-3xl font-light flex items-center gap-2'>
            <ShieldCheck className='w-7 h-7 text-emerald-400' />
            Welcome to ATLAS
          </CardTitle>
          <CardDescription>
            Complete the full first-time setup including Apps Script integration.
          </CardDescription>
          <ProgressDots activeStep={setupStep} totalSteps={3} />
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='space-y-2'>
            <h3 className='text-lg font-medium'>Step 1: Confirm backend health</h3>
            <p className='verify-state text-sm text-muted-foreground'>
              <span className={`verify-dot ${healthVerified ? 'done' : 'pulse'}`} /> ATLAS worker is
              {healthVerified ? ' reachable.' : ' being checked...'}
            </p>
          </div>

          <div className='space-y-2'>
            <h3 className='text-lg font-medium'>Step 2: Deploy your Google Apps Script</h3>
            <p className='text-sm text-muted-foreground'>
              Copy this script into Google Apps Script, run <strong>runInitialSync()</strong> once,
              then set an hourly trigger (or run <strong>createHourlySyncTrigger()</strong>). No web app deployment required.
            </p>
            <CodeBlock code={appsScriptTemplate} />
            <div className='manual-db'>
              <Button type='button' variant='outline' onClick={handleVerifyInitialSync}>
                Verify Initial Sync
              </Button>
            </div>
            <p className='verify-state text-sm text-muted-foreground'>
              <span className={`verify-dot ${initialSyncVerified ? 'done' : 'pulse'}`} />
              {initialSyncVerified
                ? ` Initial sync verified (${syncCounts.courses} courses, ${syncCounts.assignments} assignments).`
                : ' Initial sync not verified yet.'}
            </p>
            {lastSyncAt && (
              <p className='text-xs text-muted-foreground'>
                Last sync: {new Date(lastSyncAt).toLocaleString()} {syncDetails ? `(${syncDetails})` : ''}
              </p>
            )}
          </div>

          <div className='space-y-2'>
            <h3 className='text-lg font-medium'>Step 3: Final checklist</h3>
            <label className='flex items-start gap-2 text-sm text-muted-foreground'>
              <input
                type='checkbox'
                checked={checklistConfirmed}
                onChange={e => setChecklistConfirmed(e.target.checked)}
              />
              I created and ran the script once, and configured hourly sync trigger.
            </label>
            <label className='flex items-start gap-2 text-sm text-muted-foreground'>
              <input type='checkbox' checked={healthVerified} readOnly />
              ATLAS worker health check passed.
            </label>
            <label className='flex items-start gap-2 text-sm text-muted-foreground'>
              <input type='checkbox' checked={initialSyncVerified} readOnly />
              Initial sync from Apps Script verified by ATLAS.
            </label>
          </div>

          {error && <p className='text-sm text-red-400'>{error}</p>}

          <Button
            onClick={handleFinishSetup}
            disabled={saving || !initialSyncVerified || !checklistConfirmed}
            className='w-full'
          >
            {saving ? 'Finishing setup...' : 'Finish Setup'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
