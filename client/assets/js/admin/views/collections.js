import { api } from '../../services/api.js';
import { formatMonth } from '../../utils/dom.js';
import { crudView } from './crud.js';

export const projectsView = crudView({
  id: 'projects',
  label: 'Projects',
  singular: 'project',
  resource: 'projects',
  load: () => api.projects(),
  title: (p) => `${p.title}${p.featured ? ' ★' : ''}`,
  meta: (p) => `${p.category || 'Uncategorized'} · order ${p.order ?? '—'} · ${(p.tags ?? []).join(', ')}`,
  body: (p) => p.description,
  fields: [
    { name: 'title', label: 'Title', required: true, max: 100, wide: true },
    { name: 'description', label: 'Description', type: 'textarea', required: true, max: 600, rows: 4, wide: true },
    { name: 'category', label: 'Category', max: 40, placeholder: 'Web App' },
    { name: 'order', label: 'Display order', type: 'number', min: 0, hint: '(lower = first)' },
    { name: 'tags', label: 'Tags', type: 'csv', hint: '(comma-separated)', placeholder: 'React, Node.js', wide: true },
    { name: 'image', label: 'Cover image', type: 'image', wide: true, hint: '(optional — a gradient is generated if empty)' },
    { name: 'repoUrl', label: 'Source code URL', placeholder: 'https://github.com/…' },
    { name: 'liveUrl', label: 'Live demo URL', placeholder: 'https://…' },
    { name: 'featured', label: 'Featured project', type: 'checkbox' },
  ],
});

export const experienceView = crudView({
  id: 'experience',
  label: 'Experience',
  singular: 'entry',
  resource: 'experience',
  load: () => api.experience(),
  title: (x) => `${x.role} @ ${x.company}`,
  meta: (x) => `${formatMonth(x.start)} — ${formatMonth(x.end)}${x.location ? ` · ${x.location}` : ''}`,
  body: (x) => x.summary,
  fields: [
    { name: 'role', label: 'Role / degree', required: true, max: 100 },
    { name: 'company', label: 'Company / school', required: true, max: 100 },
    { name: 'start', label: 'Start', type: 'month', required: true, placeholder: 'YYYY-MM' },
    { name: 'end', label: 'End', type: 'month', hint: '(empty = Present)', placeholder: 'YYYY-MM' },
    { name: 'location', label: 'Location', max: 60, placeholder: 'Remote', wide: true },
    { name: 'summary', label: 'Summary', type: 'textarea', max: 500, wide: true },
    { name: 'highlights', label: 'Highlights', type: 'lines', hint: '(one per line)', rows: 4, wide: true },
  ],
});

export const skillsView = crudView({
  id: 'skills',
  label: 'Skills',
  singular: 'skill group',
  resource: 'skills',
  load: () => api.skills(),
  title: (g) => g.category,
  meta: (g) => `${g.items?.length ?? 0} skills · order ${g.order ?? '—'}`,
  body: (g) => (g.items ?? []).map((s) => `${s.name} (${s.level}%)`).join(' · '),
  fields: [
    { name: 'category', label: 'Group name', required: true, max: 60, placeholder: 'Frontend' },
    { name: 'order', label: 'Display order', type: 'number', min: 0 },
    {
      name: 'items',
      label: 'Skills',
      type: 'repeater',
      addLabel: 'Add skill',
      fields: [
        { name: 'name', label: 'Skill', required: true, max: 60 },
        { name: 'level', label: 'Level %', type: 'number', min: 0, maxValue: 100, required: true },
      ],
    },
  ],
});
