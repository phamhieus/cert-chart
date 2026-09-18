import { ExternalLink, GraduationCap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/Feedback';
import { Select, type SelectOption } from '../../components/Select';
import type { Course, CourseType, DeliveryMode } from '../../types';
import { filterCourses, type PriceFilter } from '../../utils/filters';
import { formatClockTime, formatDate, formatDateTime, formatPrice } from '../../utils/format';
import { locationLabel } from '../../utils/regions';

const TYPE_OPTIONS: Array<SelectOption<CourseType | 'all'>> = [
  { value: 'all', label: 'All providers' },
  { value: 'official', label: 'Official' },
  { value: 'training-center', label: 'Training centers' },
  { value: 'online-platform', label: 'Online platforms' },
];

const DELIVERY_OPTIONS: Array<SelectOption<DeliveryMode | 'all'>> = [
  { value: 'all', label: 'Any delivery' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
];

const PRICE_OPTIONS: Array<SelectOption<PriceFilter>> = [
  { value: 'all', label: 'Any price' },
  { value: 'free', label: 'Free' },
  { value: 'paid', label: 'Paid' },
];

const SECTION_TITLES: Record<CourseType, string> = {
  official: 'Official',
  'training-center': 'Training centers',
  'online-platform': 'Online courses',
};

const SECTION_ORDER: CourseType[] = ['official', 'training-center', 'online-platform'];

function CourseRow({ course }: { course: Course }) {
  return (
    <article className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <h4 className="text-[13px] font-medium text-ink">{course.name}</h4>
        <p className="mt-0.5 text-xs text-muted">
          <a
            href={course.provider.url}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-accent hover:underline"
          >
            {course.provider.name}
          </a>
          {course.type === 'training-center' ? ` · ${locationLabel(course.location)}` : ''}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {course.delivery.map((mode) => (
            <Badge key={mode}>{mode}</Badge>
          ))}
          <Badge>{course.language}</Badge>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="num text-[13px] text-ink">
          {formatPrice(course.price, course.currency ?? 'USD')}
        </span>
        <span
          className="num text-2xs text-faint"
          title={`Checked at ${formatDateTime(course.lastChecked)}`}
        >
          Checked {formatDate(course.lastChecked)}
          {formatClockTime(course.lastChecked) === '—'
            ? ''
            : `, ${formatClockTime(course.lastChecked)}`}
        </span>
        <a href={course.courseUrl} target="_blank" rel="noreferrer noopener" className="link text-2xs">
          View course
          <ExternalLink size={10} />
        </a>
      </div>
    </article>
  );
}

interface CoursesTabProps {
  certificationId: string;
  courses: Course[];
  region: string;
}

export function CoursesTab({ certificationId, courses, region }: CoursesTabProps) {
  const [type, setType] = useState<CourseType | 'all'>('all');
  const [delivery, setDelivery] = useState<DeliveryMode | 'all'>('all');
  const [price, setPrice] = useState<PriceFilter>('all');
  const [language, setLanguage] = useState('all');

  const languageOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: 'Any language' },
      ...[...new Set(courses.map((course) => course.language))]
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value })),
    ],
    [courses],
  );

  const visible = useMemo(
    () => filterCourses(courses, { certificationId, region, type, delivery, price, language }),
    [courses, certificationId, region, type, delivery, price, language],
  );

  const sections = SECTION_ORDER.map((sectionType) => ({
    type: sectionType,
    items: visible.filter((course) => course.type === sectionType),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <Select value={type} options={TYPE_OPTIONS} onChange={setType} ariaLabel="Provider type" />
        <Select
          value={delivery}
          options={DELIVERY_OPTIONS}
          onChange={setDelivery}
          ariaLabel="Delivery mode"
        />
        <Select value={price} options={PRICE_OPTIONS} onChange={setPrice} ariaLabel="Price" />
        <Select
          value={language}
          options={languageOptions}
          onChange={setLanguage}
          ariaLabel="Language"
        />
        <span className="num ml-auto text-2xs text-faint">{visible.length} courses</span>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto">
        {sections.length === 0 ? (
          <EmptyState
            icon={<GraduationCap size={18} />}
            title="No course recorded yet"
            description="Official learning paths are collected on every crawl; training centers need a provider crawler to be enabled in crawler/config.ts."
          />
        ) : (
          sections.map((section) => (
            <section key={section.type}>
              <h3 className="sticky top-0 z-[1] border-b border-line bg-surface px-4 py-2 text-2xs font-semibold uppercase tracking-wide text-faint">
                {SECTION_TITLES[section.type]}
                <span className="num ml-2 text-faint">{section.items.length}</span>
              </h3>
              {section.items.map((course) => (
                <CourseRow key={course.id} course={course} />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
