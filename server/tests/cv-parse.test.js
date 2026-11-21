import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCv } from '../src/services/cv-import/parse.js';

// Text as pdf.js extracts it from a CV made with this site's own CV design:
// letter-spaced headings, no bullet characters, skill "chips" separated by " | ".
const SITE_DESIGN = `Sam Lee
Data Analyst
sam@example.com | +1 555 123 4567 | Toronto, Canada
linkedin.com/in/samlee | github.com/samlee
P R O F I L E
Data analyst with four years of experience turning messy data into clear dashboards.
E X P E R I E N C E
Data Analyst · Northwind | Jan 2022 – Present
Built weekly sales dashboards in Power BI used by 40 managers across the
company.
Cut report preparation time by 60% with automated SQL pipelines.
Junior Analyst · Contoso | Jun 2020 – Dec 2021
Cleaned and validated customer data for the CRM migration.
P R O J E C T S
Churn Model
Predicted customer churn with Python and scikit-learn.
E D U CAT I O N
B.Sc. Statistics · University of Toronto | 2016 – 2020
S K I L L S
SQL | Python | Power BI | Excel
Data Visualization | Statistics
C E R T I F I CAT I O N S
Google Data Analytics Certificate`;

test('cv parser: reads CVs made with the site’s own design', () => {
  const { cv } = parseCv(SITE_DESIGN);
  assert.equal(cv.name, 'Sam Lee');
  assert.equal(cv.title, 'Data Analyst');
  assert.equal(cv.location, 'Toronto, Canada');
  assert.deepEqual(cv.links, ['linkedin.com/in/samlee', 'github.com/samlee']);
  assert.match(cv.summary, /four years/);
  assert.deepEqual(
    cv.experience.map(({ role, company, dates }) => ({ role, company, dates })),
    [
      { role: 'Data Analyst', company: 'Northwind', dates: 'Jan 2022 – Present' },
      { role: 'Junior Analyst', company: 'Contoso', dates: 'Jun 2020 – Dec 2021' },
    ],
  );
  // wrapped line joined, new sentence = new point
  assert.deepEqual(cv.experience[0].details.split('\n'), [
    'Built weekly sales dashboards in Power BI used by 40 managers across the company.',
    'Cut report preparation time by 60% with automated SQL pipelines.',
  ]);
  assert.deepEqual(cv.projects, [{ name: 'Churn Model', details: 'Predicted customer churn with Python and scikit-learn.' }]);
  assert.deepEqual(cv.education, [{ degree: 'B.Sc. Statistics', school: 'University of Toronto', year: '2016 – 2020' }]);
  assert.deepEqual(cv.skills, ['SQL', 'Python', 'Power BI', 'Excel', 'Data Visualization', 'Statistics']);
  assert.deepEqual(cv.certifications, ['Google Data Analytics Certificate']);
});

test('cv parser: two-line names, bullet symbols, "Role at Company", open-ended dates', () => {
  const { cv } = parseCv(`JOHN
SMITH
john.smith@mail.com
Work Experience
Backend Developer at Acme
2021 - Running
➢ Designed REST APIs in Node.js
● | Reduced response times by 30%
Education
▪ BSc in CSE, North South University, 2016-2020`);
  assert.equal(cv.name, 'John Smith');
  assert.deepEqual(cv.experience, [{ role: 'Backend Developer', company: 'Acme', dates: '2021 – Running', details: 'Designed REST APIs in Node.js\nReduced response times by 30%' }]);
  assert.deepEqual(cv.education, [{ degree: 'BSc in CSE', school: 'North South University', year: '2016 – 2020' }]);
});
