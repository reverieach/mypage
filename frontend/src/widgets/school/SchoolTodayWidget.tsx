import { BookOpen, CalendarDays, Clock3, MapPin, UserRound } from 'lucide-react'

import type { DataWidgetConfig } from '../../config/types'
import { type SchoolTodayData, useAgentWidget } from '../../data/widgetData'
import { WidgetError, WidgetLoading, WidgetMeta } from '../WidgetStatus'

type Course = SchoolTodayData['courses'][number]

function formatDate(value?: string) {
  if (!value) {
    return ''
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function courseTime(course: Course) {
  if (course.start && course.end) {
    return `${course.start}-${course.end}`
  }

  return course.time ?? ''
}

function statusLabel(status?: Course['status']) {
  if (status === 'current') {
    return '进行中'
  }

  if (status === 'finished') {
    return '已结束'
  }

  return '未开始'
}

function statusClass(status?: Course['status']) {
  if (status === 'current') {
    return 'bg-emerald-300/18 text-emerald-100'
  }

  if (status === 'finished') {
    return 'bg-white/7 text-white/36'
  }

  return 'bg-sky-300/16 text-sky-100'
}

function focusCopy(data: SchoolTodayData) {
  if (!data.configured) {
    return '课表未导入'
  }

  if (data.dayStatus === 'in-class') {
    return '正在上课'
  }

  if (data.dayStatus === 'before-class') {
    return '下一节课'
  }

  if (data.dayStatus === 'after-class') {
    return '今天课程已结束'
  }

  return '今天无课'
}

function CourseFocus({ course, data }: { course?: Course | null; data: SchoolTodayData }) {
  if (!data.configured) {
    return (
      <div className="rounded-2xl bg-white/9 px-3 py-3 text-sm text-white/58">
        把课表放到本地后，这里会显示今天的课程。
      </div>
    )
  }

  if (!course) {
    return (
      <div className="rounded-2xl bg-white/9 px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white/82">
          <BookOpen className="h-4 w-4 text-emerald-100" aria-hidden="true" />
          {focusCopy(data)}
        </div>
        <p className="mt-1 text-xs text-white/48">
          {data.weekNumber ? `第 ${data.weekNumber} 周` : '固定课表'}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white/12 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-white/46">{focusCopy(data)}</p>
          <p className="mt-1 truncate text-base font-semibold text-white/88">
            {course.name}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${statusClass(course.status)}`}>
          {statusLabel(course.status)}
        </span>
      </div>
      <div className="mt-2 grid gap-1 text-xs text-white/56">
        <span className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {courseTime(course)}
          {course.sections?.length ? ` · ${course.sections.join('-')} 节` : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="truncate">{course.location || '地点未写'}</span>
        </span>
      </div>
    </div>
  )
}

export function SchoolTodayWidget({
  config,
}: {
  config: DataWidgetConfig
}) {
  const query = useAgentWidget<SchoolTodayData>(config)

  if (query.isLoading) {
    return <WidgetLoading />
  }

  if (query.isError || !query.data) {
    return <WidgetError message="Today needs the local Agent." />
  }

  const data = query.data.data
  const focusCourse = data.currentCourse ?? data.nextCourse

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden" data-endpoint={config.endpoint}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-white/82">
          <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {formatDate(data.date)} · {data.weekdayLabel ?? 'Today'}
          </span>
        </div>
        {data.weekNumber ? (
          <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/52">
            W{data.weekNumber}
          </span>
        ) : null}
      </div>

      <CourseFocus course={focusCourse} data={data} />

      <div className="scrollbar-none min-h-0 flex-1 space-y-2 overflow-y-auto">
        {data.courses.length ? (
          data.courses.map((course) => (
            <div
              key={course.id ?? `${course.name}-${courseTime(course)}`}
              className={`rounded-2xl px-3 py-2 transition ${
                course.status === 'current'
                  ? 'bg-emerald-300/14'
                  : course.status === 'finished'
                    ? 'bg-white/6 opacity-70'
                    : 'bg-white/9'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-white/78">
                  {course.name}
                </p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${statusClass(course.status)}`}>
                  {statusLabel(course.status)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-white/46">
                <Clock3 className="h-3.5 w-3.5 shrink-0" />
                <span>{courseTime(course)}</span>
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{course.location}</span>
              </div>
              {course.teacher ? (
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/38">
                  <UserRound className="h-3.5 w-3.5" />
                  <span>{course.teacher}</span>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-white/8 p-4 text-center text-sm text-white/52">
            {focusCopy(data)}
          </div>
        )}
      </div>

      <WidgetMeta envelope={query.data} />
    </div>
  )
}
