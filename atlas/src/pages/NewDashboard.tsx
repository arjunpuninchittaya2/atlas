import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Home, Calendar, BookOpen, User, Plus, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getDashboard, updateAssignment, logout, type Assignment, type DashboardResponse } from '@/lib/new-api'
import { isAuthenticated } from '@/lib/storage'
import { cn } from '@/lib/utils'

export default function NewDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<'dashboard' | 'courses' | 'calendar'>('dashboard')
  const [searchQuery, setSearchQuery] = useState('')
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
  }, [navigate])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleToggleAssignment = async (assignment: Assignment) => {
    if (!data) return

    const newStatus = assignment.status === 'COMPLETED' ? 'NOT_STARTED' : 'COMPLETED'

    try {
      const updated = await updateAssignment(assignment.id, { status: newStatus })
      setData({
        ...data,
        assignments: data.assignments.map(a =>
          a.id === assignment.id ? updated.assignment : a
        ),
      })
    } catch (err) {
      console.error('Failed to update assignment:', err)
    }
  }

  const getCourseById = (courseId: string) => {
    return data?.courses.find(c => c.id === courseId)
  }

  const filteredAssignments = data?.assignments.filter(a => {
    if (!searchQuery) return true
    const course = getCourseById(a.courseId)
    return (
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course?.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

  const upcomingAssignments = filteredAssignments
    ?.filter(a => a.status !== 'COMPLETED' && a.dueDate)
    .sort((a, b) => {
      if (!a.dueDate || !b.dueDate) return 0
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
    .slice(0, 10)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Failed to load dashboard</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex">
      {/* Sidebar */}
      <aside className="w-80 bg-black rounded-2xl m-4 p-4 flex flex-col gap-4">
        {/* Branding */}
        <div className="flex items-center gap-2 px-2">
          <div className="w-8 h-8 bg-neutral-900 rounded flex items-center justify-center">
            <div className="w-4 h-4 bg-white rounded-sm"></div>
          </div>
          <span className="font-semibold text-base">ATLAS</span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-black border-neutral-800"
          />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1">
          <Button
            variant={activeView === 'dashboard' ? 'secondary' : 'ghost'}
            className="w-full justify-start"
            onClick={() => setActiveView('dashboard')}
          >
            <Home className="w-4 h-4 mr-2" />
            Dashboard
          </Button>
          <Button
            variant={activeView === 'courses' ? 'secondary' : 'ghost'}
            className="w-full justify-start"
            onClick={() => setActiveView('courses')}
          >
            <BookOpen className="w-4 h-4 mr-2" />
            Courses
          </Button>
          <Button
            variant={activeView === 'calendar' ? 'secondary' : 'ghost'}
            className="w-full justify-start"
            onClick={() => setActiveView('calendar')}
          >
            <Calendar className="w-4 h-4 mr-2" />
            Calendar
          </Button>
        </nav>

        {/* Divider */}
        <div className="h-px bg-neutral-800" />

        {/* User Profile */}
        <div className="flex items-center justify-between px-2 py-2 rounded hover:bg-neutral-900 cursor-pointer">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black border border-neutral-800 rounded-full flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <span className="text-sm">{data.user.name || data.user.email}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleLogout}
          >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        {activeView === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-light">Dashboard</h1>
              <Button onClick={() => {/* TODO: Open add assignment modal */}}>
                <Plus className="w-4 h-4 mr-2" />
                New Assignment
              </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    Active Courses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-light">{data.courses.filter(c => c.enabled).length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    Pending Assignments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-light">
                    {data.assignments.filter(a => a.status !== 'COMPLETED').length}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    Completed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-light">
                    {data.assignments.filter(a => a.status === 'COMPLETED').length}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Upcoming Assignments */}
            <Card>
              <CardHeader>
                <CardTitle className="text-xl font-light">Upcoming Assignments</CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingAssignments && upcomingAssignments.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingAssignments.map((assignment) => {
                      const course = getCourseById(assignment.courseId)
                      return (
                        <div
                          key={assignment.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={assignment.status === 'COMPLETED'}
                              onChange={() => handleToggleAssignment(assignment)}
                              className="w-4 h-4 rounded border-neutral-800"
                            />
                            <div>
                              <p className={cn(
                                "font-medium",
                                assignment.status === 'COMPLETED' && "line-through text-muted-foreground"
                              )}>
                                {assignment.title}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {course?.name} • {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No due date'}
                              </p>
                            </div>
                          </div>
                          <span className={cn(
                            "text-xs px-2 py-1 rounded-full",
                            assignment.type === 'ASSIGNMENT' && "bg-blue-500/10 text-blue-500",
                            assignment.type === 'QUIZ' && "bg-red-500/10 text-red-500",
                            assignment.type === 'MATERIAL' && "bg-green-500/10 text-green-500"
                          )}>
                            {assignment.type}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No upcoming assignments
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeView === 'courses' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-light">Courses</h1>
              <Button onClick={() => {/* TODO: Open add course modal */}}>
                <Plus className="w-4 h-4 mr-2" />
                New Course
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {data.courses.map((course) => (
                <Card key={course.id}>
                  <CardHeader>
                    <CardTitle className="text-lg font-normal">{course.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {data.assignments.filter(a => a.courseId === course.id).length} assignments
                    </p>
                  </CardContent>
                </Card>
              ))}
              {data.courses.length === 0 && (
                <div className="col-span-3 text-center py-12 text-muted-foreground">
                  No courses yet. Create one to get started.
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'calendar' && (
          <div className="space-y-6">
            <h1 className="text-3xl font-light">Calendar</h1>
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Calendar view coming soon
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
