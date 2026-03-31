import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen,
  Calendar,
  CalendarDays,
  ClipboardList,
  ChevronDown,
  Edit3,
  Goal,
  Home,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Timer,
  Trash2,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as DateCalendar } from '@/components/ui/calendar'
import { type ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import {
  createAssignment,
  createCourse,
  deleteCourse,
  getDashboard,
  logout,
  updateAssignment,
  updateCourse,
  type Assignment,
  type DashboardResponse,
} from '@/lib/new-api'
import { isAuthenticated } from '@/lib/storage'
import { cn } from '@/lib/utils'

type ViewId =
  | 'overview'
  | 'planner'
  | 'courses'
  | 'assignments'
  | 'calendar'
  | 'focus'
  | 'notes'
  | 'goals'
  | 'insights'
  | 'settings'

type Note = {
  id: string
  title: string
  body: string
  updatedAt: string
}

type TodoItem = {
  id: string
  title: string
  done: boolean
  createdAt: string
}

type StudyGoal = {
  id: string
  title: string
  progress: number
}

type FocusSession = {
  startedAt: string
  minutes: number
}

type NavItem = {
  id: ViewId
  icon: LucideIcon
  label: string
}

type AssignmentDraft = {
  courseId: string
  title: string
  dueDate: string | null
  link: string | null
  status: Assignment['status']
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', icon: Home, label: 'Overview' },
  { id: 'planner', icon: ClipboardList, label: 'Planner' },
  { id: 'courses', icon: BookOpen, label: 'Courses' },
  { id: 'assignments', icon: ListChecks, label: 'Assignments' },
  { id: 'calendar', icon: Calendar, label: 'Calendar' },
  { id: 'focus', icon: Timer, label: 'Focus Timer' },
  { id: 'notes', icon: Edit3, label: 'Notes' },
  { id: 'goals', icon: Goal, label: 'Goals' },
  { id: 'insights', icon: MoreHorizontal, label: 'Insights' },
  { id: 'settings', icon: User, label: 'Settings' },
]

const NOTES_KEY = 'atlas_notes'
const GOALS_KEY = 'atlas_goals'
const FOCUS_KEY = 'atlas_focus_sessions'
const TODOS_KEY = 'atlas_todos'

function safeLocalGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function safeLocalSet(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

function toStartOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

function isWithinTwoWeeks(assignment: Assignment) {
  const now = toStartOfDay(new Date())
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 14)

  const reference = assignment.dueDate
    ? toStartOfDay(new Date(assignment.dueDate))
    : toStartOfDay(new Date(assignment.createdAt))

  return reference >= cutoff
}

function parseDateInput(value: string | null) {
  if (!value) return undefined
  const parsed = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function toAssignmentDraft(assignment: Assignment): AssignmentDraft {
  return {
    courseId: assignment.courseId,
    title: assignment.title,
    dueDate: assignment.dueDate,
    link: assignment.link,
    status: assignment.status,
  }
}

function normalizeAssignmentUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true as const, value: null as string | null }
  try {
    const normalized = new URL(trimmed).toString()
    return { ok: true as const, value: normalized }
  } catch {
    return { ok: false as const }
  }
}

function formatStatusLabel(status: Assignment['status']) {
  return status
    .toLowerCase()
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function NewDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<ViewId>('assignments')
  const [searchQuery, setSearchQuery] = useState('')
  const [courseName, setCourseName] = useState('')
  const [courseColor, setCourseColor] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [goalTitle, setGoalTitle] = useState('')
  const [notes, setNotes] = useState<Note[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [goals, setGoals] = useState<StudyGoal[]>([])
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([])
  const [secondsLeft, setSecondsLeft] = useState(25 * 60)
  const [timerRunning, setTimerRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [courseSort, setCourseSort] = useState<'name-asc' | 'name-desc' | 'created-desc'>('name-asc')
  const [schoolSort, setSchoolSort] = useState<'due-asc' | 'due-desc' | 'created-desc' | 'title-asc'>('due-asc')
  const [mainDueSort, setMainDueSort] = useState<'due-asc' | 'due-desc'>('due-asc')
  const [noteSort, setNoteSort] = useState<'updated-desc' | 'title-asc'>('updated-desc')
  const [goalSort, setGoalSort] = useState<'progress-desc' | 'title-asc'>('progress-desc')
  const [focusSort, setFocusSort] = useState<'newest' | 'oldest' | 'minutes-desc'>('newest')
  const [calendarSort, setCalendarSort] = useState<'title-asc' | 'status'>('title-asc')

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDateKey, setSelectedDateKey] = useState(formatDateKey(new Date()))
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({})

  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login')
      return
    }

    getDashboard()
      .then(setData)
      .catch(() => {
        logout()
        navigate('/login')
      })
      .finally(() => setLoading(false))

    setNotes(safeLocalGet<Note[]>(NOTES_KEY, []))
    setTodos(safeLocalGet<TodoItem[]>(TODOS_KEY, []))
    setGoals(safeLocalGet<StudyGoal[]>(GOALS_KEY, []))
    setFocusSessions(safeLocalGet<FocusSession[]>(FOCUS_KEY, []))
  }, [navigate])

  useEffect(() => safeLocalSet(NOTES_KEY, notes), [notes])
  useEffect(() => safeLocalSet(TODOS_KEY, todos), [todos])
  useEffect(() => safeLocalSet(GOALS_KEY, goals), [goals])
  useEffect(() => safeLocalSet(FOCUS_KEY, focusSessions), [focusSessions])

  useEffect(() => {
    if (!timerRunning || secondsLeft <= 0) {
      if (secondsLeft <= 0 && timerRunning) {
        setFocusSessions(prev => [{ startedAt: new Date().toISOString(), minutes: 25 }, ...prev].slice(0, 200))
        setTimerRunning(false)
        setSecondsLeft(25 * 60)
      }
      return
    }

    const timer = window.setInterval(() => setSecondsLeft(prev => prev - 1), 1000)
    return () => window.clearInterval(timer)
  }, [timerRunning, secondsLeft])

  const visibleSchoolAssignments = useMemo(() => {
    const all = (data?.assignments ?? []).filter(isWithinTwoWeeks)

    const searched = all.filter(a => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      const course = data?.courses.find(c => c.id === a.courseId)
      return (
        a.title.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        course?.name.toLowerCase().includes(q)
      )
    })

    const sorted = [...searched]
    sorted.sort((a, b) => {
      if (schoolSort === 'title-asc') return a.title.localeCompare(b.title)
      if (schoolSort === 'created-desc') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

      const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER
      if (schoolSort === 'due-desc') return db - da
      return da - db
    })
    return sorted
  }, [data, searchQuery, schoolSort])

  const sortedCourses = useMemo(() => {
    const arr = [...(data?.courses ?? [])]
    arr.sort((a, b) => {
      if (courseSort === 'name-desc') return b.name.localeCompare(a.name)
      if (courseSort === 'created-desc') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      return a.name.localeCompare(b.name)
    })
    return arr
  }, [data, courseSort])

  const sortedNotes = useMemo(() => {
    const arr = [...notes]
    arr.sort((a, b) => {
      if (noteSort === 'title-asc') return a.title.localeCompare(b.title)
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
    return arr
  }, [notes, noteSort])

  const sortedGoals = useMemo(() => {
    const arr = [...goals]
    arr.sort((a, b) => {
      if (goalSort === 'title-asc') return a.title.localeCompare(b.title)
      return b.progress - a.progress
    })
    return arr
  }, [goals, goalSort])

  const sortedFocusSessions = useMemo(() => {
    const arr = [...focusSessions]
    arr.sort((a, b) => {
      if (focusSort === 'oldest') return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
      if (focusSort === 'minutes-desc') return b.minutes - a.minutes
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    })
    return arr
  }, [focusSessions, focusSort])

  const assignmentsByDate = useMemo(() => {
    const map = new Map<string, Assignment[]>()
    for (const assignment of visibleSchoolAssignments) {
      if (!assignment.dueDate) continue
      const bucket = map.get(assignment.dueDate) ?? []
      bucket.push(assignment)
      map.set(assignment.dueDate, bucket)
    }
    return map
  }, [visibleSchoolAssignments])

  const selectedDateAssignments = useMemo(() => {
    const arr = [...(assignmentsByDate.get(selectedDateKey) ?? [])]
    arr.sort((a, b) => {
      if (calendarSort === 'status') return a.status.localeCompare(b.status)
      return a.title.localeCompare(b.title)
    })
    return arr
  }, [assignmentsByDate, selectedDateKey, calendarSort])

  const mainAssignmentRows = useMemo(() => {
    const cutoff = toStartOfDay(new Date())
    cutoff.setDate(cutoff.getDate() - 2)

    const rows = (data?.assignments ?? []).filter(assignment => {
      if (assignment.type !== 'ASSIGNMENT' || !assignment.dueDate) return false
      return toStartOfDay(new Date(assignment.dueDate)) >= cutoff
    })

    rows.sort((a, b) => {
      const da = new Date(a.dueDate as string).getTime()
      const db = new Date(b.dueDate as string).getTime()
      return mainDueSort === 'due-desc' ? db - da : da - db
    })

    return rows
  }, [data, mainDueSort])

  useEffect(() => {
    setAssignmentDrafts(prev => {
      const next: Record<string, AssignmentDraft> = {}
      let changed = false
      for (const assignment of mainAssignmentRows) {
        if (prev[assignment.id]) {
          next[assignment.id] = prev[assignment.id]
        } else {
          next[assignment.id] = toAssignmentDraft(assignment)
          changed = true
        }
      }
      if (Object.keys(prev).length !== Object.keys(next).length) changed = true
      return changed ? next : prev
    })
  }, [mainAssignmentRows])

  const plannerBuckets = useMemo(() => {
    const result: Record<Assignment['status'], Assignment[]> = {
      NOT_STARTED: [],
      IN_PROGRESS: [],
      COMPLETED: [],
    }
    for (const assignment of visibleSchoolAssignments) {
      result[assignment.status].push(assignment)
    }
    return result
  }, [visibleSchoolAssignments])

  const upcomingAssignments = visibleSchoolAssignments
    .filter(a => a.status !== 'COMPLETED' && a.dueDate)
    .slice(0, 10)

  const pendingAssignments = visibleSchoolAssignments.filter(a => a.status !== 'COMPLETED').length
  const completedAssignments = visibleSchoolAssignments.filter(a => a.status === 'COMPLETED').length
  const dueThisWeek = visibleSchoolAssignments.filter(a => {
    if (!a.dueDate || a.status === 'COMPLETED') return false
    const due = new Date(a.dueDate)
    const now = new Date()
    const week = new Date()
    week.setDate(now.getDate() + 7)
    return due >= now && due <= week
  }).length

  const getCourseById = (courseId: string) => data?.courses.find(c => c.id === courseId)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleToggleAssignment = async (assignment: Assignment) => {
    if (!data) return
    try {
      const next = assignment.status === 'COMPLETED' ? 'NOT_STARTED' : 'COMPLETED'
      const updated = await updateAssignment(assignment.id, { status: next })
      setData({ ...data, assignments: data.assignments.map(a => (a.id === assignment.id ? updated.assignment : a)) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assignment')
    }
  }

  const handleCreateCourse = async () => {
    if (!data || !courseName.trim()) return
    setSaving(true)
    setError('')
    try {
      const result = await createCourse(courseName.trim(), courseColor.trim() || undefined)
      setData({ ...data, courses: [result.course, ...data.courses] })
      setCourseName('')
      setCourseColor('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create course')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateAssignmentFromMainList = async () => {
    if (!data) return
    const defaultCourseId = data.courses.find(course => course.enabled)?.id ?? data.courses[0]?.id
    if (!defaultCourseId) {
      setError('No courses available. Create a course before adding an assignment')
      return
    }

    setSaving(true)
    setError('')
    try {
      const result = await createAssignment({
        title: 'Untitled assignment',
        courseId: defaultCourseId,
        dueDate: formatDateKey(new Date()),
        type: 'ASSIGNMENT',
      })
      setData({ ...data, assignments: [result.assignment, ...data.assignments] })
      setActiveView('assignments')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assignment')
    } finally {
      setSaving(false)
    }
  }

  const getStatusBadgeVariant = (status: Assignment['status']) => {
    if (status === 'COMPLETED') return 'secondary'
    if (status === 'IN_PROGRESS') return 'default'
    return 'outline'
  }

  const patchAssignmentDraft = (assignmentId: string, patch: Partial<AssignmentDraft>) => {
    setAssignmentDrafts(prev => {
      const source = mainAssignmentRows.find(item => item.id === assignmentId)
      if (!source && !prev[assignmentId]) return prev
      const base = prev[assignmentId] ?? toAssignmentDraft(source!)
      return { ...prev, [assignmentId]: { ...base, ...patch } }
    })
  }

  const persistAssignmentPatch = async (assignmentId: string, patch: Partial<AssignmentDraft>) => {
    if (!data) return
    setSaving(true)
    setError('')
    try {
      const payload: Partial<Assignment> = {}
      if (patch.courseId !== undefined) payload.courseId = patch.courseId
      if (patch.title !== undefined) payload.title = patch.title
      if (patch.dueDate !== undefined) payload.dueDate = patch.dueDate
      if (patch.link !== undefined) payload.link = patch.link
      if (patch.status !== undefined) payload.status = patch.status

      const result = await updateAssignment(assignmentId, payload)
      setData({
        ...data,
        assignments: data.assignments.map(item => (item.id === assignmentId ? result.assignment : item)),
      })
      patchAssignmentDraft(assignmentId, toAssignmentDraft(result.assignment))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assignment')
    } finally {
      setSaving(false)
    }
  }

  const assignmentColumns: ColumnDef<Assignment>[] = [
      {
        accessorKey: 'courseId',
        header: 'Course',
        cell: ({ row }) => {
          const assignment = row.original
          const draft = assignmentDrafts[assignment.id] ?? toAssignmentDraft(assignment)
          return (
            <Select
              value={draft.courseId}
              onValueChange={value => {
                patchAssignmentDraft(assignment.id, { courseId: value })
                void persistAssignmentPatch(assignment.id, { courseId: value })
              }}
            >
              <SelectTrigger className='h-9 min-w-[160px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data?.courses.map(course => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        },
      },
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => {
          const assignment = row.original
          const draft = assignmentDrafts[assignment.id] ?? toAssignmentDraft(assignment)
          return (
            <Input
              value={draft.title}
              onChange={event => {
                setError('')
                patchAssignmentDraft(assignment.id, { title: event.target.value })
              }}
              onBlur={() => {
                const title = draft.title.trim()
                if (!title) {
                  setError('Assignment title cannot be empty')
                  patchAssignmentDraft(assignment.id, { title: assignment.title })
                  return
                }
                setError('')
                void persistAssignmentPatch(assignment.id, { title })
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
              }}
              className='h-9 min-w-[220px]'
            />
          )
        },
      },
      {
        accessorKey: 'dueDate',
        header: () => (
          <Button
            variant='ghost'
            className='h-8 px-2'
            onClick={() => setMainDueSort(prev => (prev === 'due-asc' ? 'due-desc' : 'due-asc'))}
          >
            Due Date
            <ChevronDown className={cn('ml-1 h-4 w-4 transition-transform', mainDueSort === 'due-desc' && 'rotate-180')} />
          </Button>
        ),
        cell: ({ row }) => {
          const assignment = row.original
          const draft = assignmentDrafts[assignment.id] ?? toAssignmentDraft(assignment)
          const selectedDate = parseDateInput(draft.dueDate)
          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant='outline' className='h-9 w-[190px] justify-between text-left font-normal'>
                  {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                  <Calendar className='h-4 w-4 opacity-60' />
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-auto p-0' align='start'>
                <DateCalendar
                  mode='single'
                  selected={selectedDate}
                  onSelect={date => {
                    const dueDate = date ? formatDateKey(date) : null
                    patchAssignmentDraft(assignment.id, { dueDate })
                    void persistAssignmentPatch(assignment.id, { dueDate })
                  }}
                />
              </PopoverContent>
            </Popover>
          )
        },
      },
      {
        accessorKey: 'link',
        header: 'Link',
        cell: ({ row }) => {
          const assignment = row.original
          const draft = assignmentDrafts[assignment.id] ?? toAssignmentDraft(assignment)
          return (
            <Input
              value={draft.link ?? ''}
              placeholder='https://example.com'
              onChange={event => {
                setError('')
                patchAssignmentDraft(assignment.id, { link: event.target.value || null })
              }}
              onBlur={() => {
                const normalized = normalizeAssignmentUrl(draft.link ?? '')
                if (!normalized.ok) {
                  setError('Assignment link must be a valid URL (e.g., https://example.com)')
                  patchAssignmentDraft(assignment.id, { link: assignment.link })
                  return
                }
                setError('')
                void persistAssignmentPatch(assignment.id, { link: normalized.value })
              }}
              className='h-9 min-w-[260px]'
            />
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const assignment = row.original
          const draft = assignmentDrafts[assignment.id] ?? toAssignmentDraft(assignment)
          return (
            <div className='flex items-center gap-2'>
              <Badge variant={getStatusBadgeVariant(draft.status)}>{formatStatusLabel(draft.status)}</Badge>
              <Select
                value={draft.status}
                onValueChange={value => {
                  const status = value as Assignment['status']
                  patchAssignmentDraft(assignment.id, { status })
                  void persistAssignmentPatch(assignment.id, { status })
                }}
              >
                <SelectTrigger className='h-9 w-[150px]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='NOT_STARTED'>{formatStatusLabel('NOT_STARTED')}</SelectItem>
                  <SelectItem value='IN_PROGRESS'>{formatStatusLabel('IN_PROGRESS')}</SelectItem>
                  <SelectItem value='COMPLETED'>{formatStatusLabel('COMPLETED')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )
        },
      },
    ]

  const monthDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
    const startWeekday = (first.getDay() + 6) % 7
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate()
    const cells: Array<{ key: string; date: Date | null }> = []
    for (let i = 0; i < startWeekday; i += 1) cells.push({ key: `empty-${i}`, date: null })
    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), d)
      cells.push({ key: formatDateKey(date), date })
    }
    return cells
  }, [calendarMonth])

  if (loading) return <div className='min-h-screen flex items-center justify-center bg-background text-muted-foreground'>Loading...</div>
  if (!data) return <div className='min-h-screen flex items-center justify-center bg-background text-muted-foreground'>Failed to load dashboard</div>

  return (
    <div className='min-h-screen bg-[#1a1a1a] text-neutral-50 flex'>
      <aside className='w-80 bg-black rounded-2xl m-4 p-4 flex flex-col gap-4 border border-neutral-900'>
        <div className='flex items-center gap-2 px-2'>
          <div className='w-8 h-8 bg-neutral-900 rounded flex items-center justify-center'><div className='w-4 h-4 bg-white rounded-sm' /></div>
          <span className='font-semibold text-base'>ATLAS School OS</span>
        </div>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400' />
          <Input placeholder='Search school assignments, courses...' value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className='pl-10 bg-black border-neutral-800' />
        </div>
        <nav className='flex-1 space-y-1 overflow-y-auto pr-1'>
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <Button key={id} variant={activeView === id ? 'secondary' : 'ghost'} className='w-full justify-start' onClick={() => setActiveView(id)}>
              <Icon className='w-4 h-4 mr-2' />{label}
            </Button>
          ))}
        </nav>
        <div className='h-px bg-neutral-800' />
        <div className='flex items-center justify-between px-2 py-2 rounded hover:bg-neutral-900'>
          <div className='flex items-center gap-2'><div className='w-8 h-8 bg-black border border-neutral-800 rounded-full flex items-center justify-center'><User className='w-4 h-4' /></div><span className='text-sm'>{data.user.name || data.user.email}</span></div>
          <Button variant='ghost' size='icon' className='h-8 w-8' onClick={handleLogout} title='Log out'><LogOut className='w-4 h-4' /></Button>
        </div>
      </aside>

      <main className='flex-1 p-8 overflow-y-auto space-y-6'>
        {error && <div className='p-3 rounded-lg bg-red-500/10 text-red-300 border border-red-500/20'>{error}</div>}

        {activeView === 'overview' && (
          <>
            <div className='flex items-center justify-between'><h1 className='text-3xl font-light'>Overview</h1><Button onClick={() => setActiveView('assignments')}><Plus className='w-4 h-4 mr-2' />New School Assignment</Button></div>
            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4'>
              <Card><CardHeader><CardTitle className='text-sm font-normal text-neutral-400'>Active Courses</CardTitle></CardHeader><CardContent><p className='text-3xl font-light'>{data.courses.filter(c => c.enabled).length}</p></CardContent></Card>
              <Card><CardHeader><CardTitle className='text-sm font-normal text-neutral-400'>Pending School Assignments</CardTitle></CardHeader><CardContent><p className='text-3xl font-light'>{pendingAssignments}</p></CardContent></Card>
              <Card><CardHeader><CardTitle className='text-sm font-normal text-neutral-400'>Completed School Assignments</CardTitle></CardHeader><CardContent><p className='text-3xl font-light'>{completedAssignments}</p></CardContent></Card>
              <Card><CardHeader><CardTitle className='text-sm font-normal text-neutral-400'>Due In 7 Days</CardTitle></CardHeader><CardContent><p className='text-3xl font-light'>{dueThisWeek}</p></CardContent></Card>
            </div>
            <div className='grid grid-cols-1 xl:grid-cols-3 gap-4'>
              <Card className='xl:col-span-2'>
                <CardHeader><CardTitle className='text-xl font-light'>Upcoming School Assignments</CardTitle></CardHeader>
                <CardContent className='space-y-3'>
                  {upcomingAssignments.length ? upcomingAssignments.map(a => (
                    <div key={a.id} className='flex items-center justify-between p-3 rounded-lg border border-border'>
                      <div className='flex items-center gap-3'>
                        <input type='checkbox' checked={a.status === 'COMPLETED'} onChange={() => handleToggleAssignment(a)} className='w-4 h-4 rounded border-neutral-800' />
                        <div><p className={cn('font-medium', a.status === 'COMPLETED' && 'line-through text-muted-foreground')}>{a.title}</p><p className='text-sm text-neutral-400'>{getCourseById(a.courseId)?.name} • {a.dueDate || 'No due date'}</p></div>
                      </div>
                      <span className='text-xs px-2 py-1 rounded-full bg-neutral-900'>{a.type}</span>
                    </div>
                  )) : <p className='text-neutral-400 text-center py-8'>No upcoming assignments in the last 2-week window</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className='text-xl font-light'>Today</CardTitle></CardHeader>
                <CardContent className='space-y-3'>
                  <div className='flex items-center justify-between rounded-lg border border-neutral-800 p-3'><span>Personal Todos</span><span className='text-neutral-300'>{todos.filter(t => !t.done).length} open</span></div>
                  <div className='flex items-center justify-between rounded-lg border border-neutral-800 p-3'><span>Focus block</span><Button size='sm' variant='outline' onClick={() => setActiveView('focus')}>Start</Button></div>
                  <div className='flex items-center justify-between rounded-lg border border-neutral-800 p-3'><span>Latest note</span><span className='text-xs text-neutral-400'>{sortedNotes[0]?.title || 'None'}</span></div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {activeView === 'planner' && (
          <>
            <div className='flex items-center justify-between'><h1 className='text-3xl font-light'>Planner Board</h1><select className='h-10 rounded-md border border-input bg-background px-3' value={schoolSort} onChange={e => setSchoolSort(e.target.value as typeof schoolSort)}><option value='due-asc'>Sort: Due date ascending</option><option value='due-desc'>Sort: Due date descending</option><option value='created-desc'>Sort: Newest created</option><option value='title-asc'>Sort: Title A-Z</option></select></div>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              {(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'] as Assignment['status'][]).map(status => (
                <Card key={status}><CardHeader><CardTitle className='text-lg font-normal'>{status.replace('_', ' ')}</CardTitle></CardHeader><CardContent className='space-y-3'>{plannerBuckets[status].map(a => <div key={a.id} className='border border-neutral-800 rounded-lg p-3'><p className='font-medium'>{a.title}</p><p className='text-xs text-neutral-400'>{getCourseById(a.courseId)?.name}</p></div>)}</CardContent></Card>
              ))}
            </div>
          </>
        )}

        {activeView === 'courses' && (
          <>
            <div className='flex items-center justify-between'><h1 className='text-3xl font-light'>Courses</h1><select className='h-10 rounded-md border border-input bg-background px-3' value={courseSort} onChange={e => setCourseSort(e.target.value as typeof courseSort)}><option value='name-asc'>Sort: Name A-Z</option><option value='name-desc'>Sort: Name Z-A</option><option value='created-desc'>Sort: Newest created</option></select></div>
            <Card><CardHeader><CardTitle className='text-lg font-normal'>Create Course</CardTitle></CardHeader><CardContent className='grid grid-cols-1 md:grid-cols-4 gap-3'><Input placeholder='Course name' value={courseName} onChange={e => setCourseName(e.target.value)} /><Input placeholder='Color (optional)' value={courseColor} onChange={e => setCourseColor(e.target.value)} /><Button disabled={saving || !courseName.trim()} onClick={handleCreateCourse}><Plus className='w-4 h-4 mr-2' />Add</Button></CardContent></Card>
            <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
              {sortedCourses.map(course => (
                <Card key={course.id}><CardHeader><CardTitle className='text-lg font-normal flex items-center justify-between'>{course.name}<span className='inline-block w-3 h-3 rounded-full border border-neutral-700' style={{ backgroundColor: course.color || '#3f3f46' }} /></CardTitle></CardHeader><CardContent className='space-y-3'><p className='text-sm text-neutral-400'>{visibleSchoolAssignments.filter(a => a.courseId === course.id).length} assignments</p><div className='flex gap-2'><Button size='sm' variant={course.enabled ? 'secondary' : 'outline'} onClick={async () => { const res = await updateCourse(course.id, { enabled: !course.enabled }); setData(prev => prev ? ({ ...prev, courses: prev.courses.map(c => c.id === course.id ? res.course : c) }) : prev) }}>{course.enabled ? 'Enabled' : 'Disabled'}</Button><Button size='sm' variant='destructive' onClick={async () => { await deleteCourse(course.id); setData(prev => prev ? ({ ...prev, courses: prev.courses.filter(c => c.id !== course.id), assignments: prev.assignments.filter(a => a.courseId !== course.id) }) : prev) }}><Trash2 className='w-3 h-3 mr-1' />Delete</Button></div></CardContent></Card>
              ))}
            </div>
          </>
        )}

        {activeView === 'assignments' && (
          <>
            <h1 className='text-3xl font-light'>Assignments</h1>
            <Card>
              <CardContent className='py-4 space-y-4'>
                <div className='flex flex-wrap items-center gap-2 text-sm'>
                  <Badge variant='outline' className='gap-1'>
                    Due Date {mainDueSort === 'due-asc' ? '↑' : '↓'}
                  </Badge>
                  <Badge variant='outline'>Type: ASSIGNMENT</Badge>
                  <Badge variant='outline'>Due Date: After 2 days ago</Badge>
                  <Badge variant='secondary'>+ Filter</Badge>
                </div>
                <DataTable columns={assignmentColumns} data={mainAssignmentRows} />
                {!mainAssignmentRows.length && (
                  <p className='text-sm text-neutral-400'>No assignments match the current filters.</p>
                )}
                <div className='flex items-center justify-center gap-2 pt-2'>
                  <Button variant='outline' disabled className='gap-2'>
                    <CalendarDays className='h-4 w-4' />
                    Edit filters
                  </Button>
                  <Button onClick={handleCreateAssignmentFromMainList} disabled={saving}>
                    <Plus className='w-4 h-4 mr-2' />
                    New page
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {activeView === 'calendar' && (
          <>
            <div className='flex items-center justify-between'><h1 className='text-3xl font-light'>Calendar</h1><div className='flex gap-2'><Button variant='outline' onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>Prev</Button><div className='px-3 py-2 border border-neutral-800 rounded-md'>{calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</div><Button variant='outline' onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>Next</Button></div></div>
            <Card><CardContent className='py-6'><div className='grid grid-cols-7 gap-2 text-xs text-neutral-400 mb-2'>{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <div key={d} className='text-center'>{d}</div>)}</div><div className='grid grid-cols-7 gap-2'>{monthDays.map(cell => {
              if (!cell.date) return <div key={cell.key} className='h-24 rounded border border-transparent' />
              const dateKey = formatDateKey(cell.date)
              const count = (assignmentsByDate.get(dateKey) ?? []).length
              const selected = selectedDateKey === dateKey
              return <button key={cell.key} onClick={() => setSelectedDateKey(dateKey)} className={cn('h-24 rounded border p-2 text-left', selected ? 'border-neutral-200 bg-neutral-900' : 'border-neutral-800 bg-black hover:bg-neutral-900')}><div className='text-sm'>{cell.date.getDate()}</div><div className='text-xs text-neutral-400 mt-2'>{count ? `${count} item${count > 1 ? 's' : ''}` : ''}</div></button>
            })}</div></CardContent></Card>
            <Card><CardHeader><CardTitle className='text-xl font-light flex items-center justify-between'><span>{new Date(selectedDateKey).toDateString()}</span><select className='h-9 rounded-md border border-input bg-background px-2 text-sm' value={calendarSort} onChange={e => setCalendarSort(e.target.value as typeof calendarSort)}><option value='title-asc'>Title A-Z</option><option value='status'>Status</option></select></CardTitle></CardHeader><CardContent className='space-y-2'>{selectedDateAssignments.length ? selectedDateAssignments.map(a => <div key={a.id} className='flex items-center justify-between text-sm border border-neutral-800 rounded p-2'><span>{a.title}</span><span className='text-neutral-500'>{a.status.replace('_', ' ')}</span></div>) : <p className='text-neutral-400'>No school assignments due this day.</p>}</CardContent></Card>
          </>
        )}

        {activeView === 'focus' && (
          <>
            <div className='flex items-center justify-between'><h1 className='text-3xl font-light'>Focus Timer</h1><select className='h-10 rounded-md border border-input bg-background px-3' value={focusSort} onChange={e => setFocusSort(e.target.value as typeof focusSort)}><option value='newest'>Sort: Newest sessions</option><option value='oldest'>Sort: Oldest sessions</option><option value='minutes-desc'>Sort: Longest first</option></select></div>
            <Card><CardContent className='py-8 flex flex-col items-center gap-4'><p className='text-6xl font-light'>{String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}</p><div className='flex gap-2'><Button onClick={() => setTimerRunning(prev => !prev)}>{timerRunning ? 'Pause' : 'Start'}</Button><Button variant='outline' onClick={() => { setTimerRunning(false); setSecondsLeft(25 * 60) }}>Reset</Button></div></CardContent></Card>
            <Card><CardHeader><CardTitle className='text-xl font-light'>Recent Sessions</CardTitle></CardHeader><CardContent className='space-y-2'>{sortedFocusSessions.slice(0, 20).map((s, i) => <div key={`${s.startedAt}-${i}`} className='flex justify-between text-sm border-b border-neutral-900 pb-2'><span>{new Date(s.startedAt).toLocaleString()}</span><span>{s.minutes} min</span></div>)}</CardContent></Card>
          </>
        )}

        {activeView === 'notes' && (
          <>
            <div className='flex items-center justify-between'><h1 className='text-3xl font-light'>Notes</h1><select className='h-10 rounded-md border border-input bg-background px-3' value={noteSort} onChange={e => setNoteSort(e.target.value as typeof noteSort)}><option value='updated-desc'>Sort: Recently updated</option><option value='title-asc'>Sort: Title A-Z</option></select></div>
            <Card><CardContent className='py-6 space-y-3'><Input placeholder='Note title' value={noteTitle} onChange={e => setNoteTitle(e.target.value)} /><textarea className='w-full min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm' placeholder='Write your study note...' value={noteBody} onChange={e => setNoteBody(e.target.value)} /><Button onClick={() => { if (!noteTitle.trim()) return; setNotes(prev => [{ id: crypto.randomUUID(), title: noteTitle.trim(), body: noteBody.trim(), updatedAt: new Date().toISOString() }, ...prev]); setNoteTitle(''); setNoteBody('') }}>Save Note</Button></CardContent></Card>
            <Card><CardContent className='py-6 space-y-3'>{sortedNotes.map(note => <div key={note.id} className='border border-neutral-800 rounded-lg p-3'><div className='flex items-center justify-between'><p className='font-medium'>{note.title}</p><Button size='sm' variant='destructive' onClick={() => setNotes(prev => prev.filter(n => n.id !== note.id))}><Trash2 className='w-3 h-3 mr-1' />Delete</Button></div>{note.body && <p className='mt-2 text-sm text-neutral-300 whitespace-pre-wrap'>{note.body}</p>}<p className='mt-2 text-xs text-neutral-500'>Updated {new Date(note.updatedAt).toLocaleString()}</p></div>)}</CardContent></Card>
          </>
        )}

        {activeView === 'goals' && (
          <>
            <div className='flex items-center justify-between'><h1 className='text-3xl font-light'>Goals</h1><select className='h-10 rounded-md border border-input bg-background px-3' value={goalSort} onChange={e => setGoalSort(e.target.value as typeof goalSort)}><option value='progress-desc'>Sort: Highest progress</option><option value='title-asc'>Sort: Title A-Z</option></select></div>
            <Card><CardContent className='py-6 flex gap-3'><Input placeholder='Add goal' value={goalTitle} onChange={e => setGoalTitle(e.target.value)} /><Button onClick={() => { if (!goalTitle.trim()) return; setGoals(prev => [{ id: crypto.randomUUID(), title: goalTitle.trim(), progress: 0 }, ...prev]); setGoalTitle('') }}>Add Goal</Button></CardContent></Card>
            <Card><CardContent className='py-6 space-y-4'>{sortedGoals.map(goal => <div key={goal.id} className='border border-neutral-800 rounded-lg p-3'><div className='flex items-center justify-between mb-2'><p className='font-medium'>{goal.title}</p><span className='text-sm text-neutral-300'>{goal.progress}%</span></div><input type='range' min={0} max={100} value={goal.progress} onChange={e => setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, progress: Number(e.target.value) } : g))} className='w-full' /></div>)}</CardContent></Card>
          </>
        )}

        {activeView === 'insights' && (
          <div className='space-y-6'>
            <h1 className='text-3xl font-light'>Insights</h1>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <Card><CardHeader><CardTitle className='text-lg font-normal'>School Assignment Completion</CardTitle></CardHeader><CardContent><div className='h-3 w-full bg-neutral-900 rounded-full overflow-hidden'><div className='h-full bg-emerald-500' style={{ width: `${Math.round((completedAssignments / Math.max(1, visibleSchoolAssignments.length)) * 100)}%` }} /></div><p className='text-sm text-neutral-400 mt-2'>{completedAssignments}/{visibleSchoolAssignments.length} completed</p></CardContent></Card>
              <Card><CardHeader><CardTitle className='text-lg font-normal'>Focus Minutes</CardTitle></CardHeader><CardContent><p className='text-4xl font-light'>{focusSessions.reduce((sum, s) => sum + s.minutes, 0)}</p><p className='text-sm text-neutral-400 mt-2'>Total completed Pomodoro minutes</p></CardContent></Card>
            </div>
          </div>
        )}

        {activeView === 'settings' && (
          <div className='space-y-6'>
            <h1 className='text-3xl font-light'>Settings</h1>
            <Card><CardContent className='py-6 space-y-3'><p className='text-sm text-neutral-400'>Account</p><p>Name: {data.user.name || 'Not set'}</p><p>Email: {data.user.email}</p>{data.user.email.toLowerCase() === '9961749@bedfordnhk12.net' && <Button variant='secondary' onClick={() => navigate('/admin')}>Open Admin Console</Button>}<Button variant='destructive' onClick={handleLogout}>Log out</Button></CardContent></Card>
          </div>
        )}
      </main>
    </div>
  )
}
