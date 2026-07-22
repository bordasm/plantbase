import { cleanDocument } from './clean.js'

const SAMPLE = `---
title: Best Time to Water Your Plants
source: https://www.thesill.com/blogs/care-miscellaneous/best-time-to-water-your-plants
category: care-miscellaneous
---

# Best Time to Water Your Plants

Common Care Questions



When watering your houseplants, keep in mind the time of day.

## Perfect Pairings For Your Plants

* ### Premium Potting Mix

  From $19

##### Words By The Sill

Empowering all people to be plant people.

Do Some Plant Shopping
`

describe('cleanDocument', () => {
  it('extracts frontmatter fields', () => {
    const result = cleanDocument(SAMPLE)

    expect(result.title).toBe('Best Time to Water Your Plants')
    expect(result.sourceUrl).toBe(
      'https://www.thesill.com/blogs/care-miscellaneous/best-time-to-water-your-plants',
    )
    expect(result.category).toBe('care-miscellaneous')
  })

  it('strips the duplicate H1 and breadcrumb label', () => {
    const result = cleanDocument(SAMPLE)

    expect(result.body).not.toContain('# Best Time to Water Your Plants')
    expect(result.body).not.toContain('Common Care Questions')
  })

  it('strips everything from the boilerplate marker onward', () => {
    const result = cleanDocument(SAMPLE)

    expect(result.body).not.toContain('Perfect Pairings')
    expect(result.body).not.toContain('Do Some Plant Shopping')
  })

  it('keeps the real content', () => {
    const result = cleanDocument(SAMPLE)

    expect(result.body).toBe(
      'When watering your houseplants, keep in mind the time of day.',
    )
  })

  it('leaves the body unchanged when the boilerplate marker is absent', () => {
    const withoutBoilerplate = `---
title: X
source: https://example.com
category: plants-101
---

# X

Plants 101

Body text here.
`
    const result = cleanDocument(withoutBoilerplate)

    expect(result.body).toBe('Body text here.')
  })
})
