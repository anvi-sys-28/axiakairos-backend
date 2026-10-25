import { KnowledgeRetriever } from '../retrieval';
import { sanitizeUrls, verifyNumericGroundedness, VALID_INTERNAL_ROUTES } from '../guardrails';
import { servicesData } from '../data/content/services';
import { caseStudies } from '../data/content/caseStudies';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passCount++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failCount++;
    console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING RETRIEVAL & GUARDRAILS UNIT TESTS');
  console.log('====================================================\n');

  const retriever = new KnowledgeRetriever();

  // ----------------------------------------------------
  // TEST SUITE 1: Service Retrieval (Top-3 contains chunk)
  // ----------------------------------------------------
  console.log('🔍 Test Suite 1: Service Retrieval by Title & Slug');
  for (const s of servicesData) {
    // 1. By exact title
    const topByTitle = retriever.search(s.title, undefined, 3);
    const foundInTitle = topByTitle.some((c) => c.slug === s.slug || c.url === `/services/${s.slug}`);
    assert(
      foundInTitle,
      `Service by title: "${s.title}"`,
      `Expected slug "${s.slug}" in top 3, got: ${topByTitle.map((c) => c.slug).join(', ')}`
    );

    // 2. By slug
    const topBySlug = retriever.search(s.slug, undefined, 3);
    const foundInSlug = topBySlug.some((c) => c.slug === s.slug || c.url === `/services/${s.slug}`);
    assert(
      foundInSlug,
      `Service by slug: "${s.slug}"`,
      `Expected slug "${s.slug}" in top 3, got: ${topBySlug.map((c) => c.slug).join(', ')}`
    );
  }

  // ----------------------------------------------------
  // TEST SUITE 2: Case Study Retrieval (Top-3 contains chunk)
  // ----------------------------------------------------
  console.log('\n🔍 Test Suite 2: Case Study Retrieval by Title & Slug');
  for (const cs of caseStudies) {
    // 1. By exact title
    const topByTitle = retriever.search(cs.title, undefined, 3);
    const foundInTitle = topByTitle.some((c) => c.slug === cs.slug || c.url === `/case-studies/${cs.slug}`);
    assert(
      foundInTitle,
      `Case Study by title: "${cs.title}"`,
      `Expected slug "${cs.slug}" in top 3, got: ${topByTitle.map((c) => c.slug).join(', ')}`
    );

    // 2. By slug
    const topBySlug = retriever.search(cs.slug, undefined, 3);
    const foundInSlug = topBySlug.some((c) => c.slug === cs.slug || c.url === `/case-studies/${cs.slug}`);
    assert(
      foundInSlug,
      `Case Study by slug: "${cs.slug}"`,
      `Expected slug "${cs.slug}" in top 3, got: ${topBySlug.map((c) => c.slug).join(', ')}`
    );
  }

  // ----------------------------------------------------
  // TEST SUITE 3: URL Sanitizer Guardrail
  // ----------------------------------------------------
  console.log('\n🛡️ Test Suite 3: URL Sanitizer Guardrail');
  
  // Valid internal relative URL
  const validRelative = 'Learn more about our [SAP Practice](/services/sap-implementation-advisory-and-support).';
  const sanitizedRelative = sanitizeUrls(validRelative);
  assert(
    sanitizedRelative === validRelative,
    'Valid internal route preserved',
    `Got: ${sanitizedRelative}`
  );

  // Valid internal absolute URL
  const validAbsolute = 'Check our [About page](https://axiakairos.com/about).';
  const sanitizedAbsolute = sanitizeUrls(validAbsolute);
  assert(
    sanitizedAbsolute === 'Check our [About page](/about).',
    'Valid absolute URL transformed to internal route',
    `Got: ${sanitizedAbsolute}`
  );

  // Invalid external URL (must strip link, leaving text)
  const externalLink = 'Visit [External Partner](https://malicious-site.example.com/phish).';
  const sanitizedExternal = sanitizeUrls(externalLink);
  assert(
    sanitizedExternal === 'Visit External Partner.',
    'Unauthorized external URL stripped to plain text',
    `Got: ${sanitizedExternal}`
  );

  // Fake non-existent internal URL
  const fakeRoute = 'Check our [Pricing Plan](/pricing-plans).';
  const sanitizedFake = sanitizeUrls(fakeRoute);
  assert(
    sanitizedFake === 'Check our Pricing Plan.',
    'Invented internal route stripped to plain text',
    `Got: ${sanitizedFake}`
  );

  // ----------------------------------------------------
  // TEST SUITE 4: Numeric / Entity Groundedness Guardrail
  // ----------------------------------------------------
  console.log('\n🔢 Test Suite 4: Numeric Groundedness Guardrail');

  const contextSample = 'The client achieved a 45% reduction in cycle times, 99.9% uptime, and $2.5M in cost savings across 120 facilities.';

  // Grounded claim
  const groundedClaim = 'Our team delivered a 45% reduction in cycle times with 99.9% uptime.';
  const groundCheck1 = verifyNumericGroundedness(groundedClaim, contextSample);
  assert(
    groundCheck1.passed && groundCheck1.ungroundedMetrics.length === 0,
    'Grounded numbers and percentages pass check'
  );

  // Ungrounded hallucinated claim
  const hallucinatedClaim = 'We guaranteed 99.999% uptime and an 80% decrease in overhead costs.';
  const groundCheck2 = verifyNumericGroundedness(hallucinatedClaim, contextSample);
  assert(
    !groundCheck2.passed && groundCheck2.ungroundedMetrics.includes('99.999%') && groundCheck2.ungroundedMetrics.includes('80%'),
    'Ungrounded metrics accurately detected and flagged',
    `Detected: ${groundCheck2.ungroundedMetrics.join(', ')}`
  );

  // ----------------------------------------------------
  // SUMMARY REPORT
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log(`📊 TEST REPORT: ${passCount} PASSED, ${failCount} FAILED (Total: ${passCount + failCount})`);
  console.log('====================================================');

  if (failCount > 0) {
    console.error('❌ CI Failure: Retrieval or Guardrail unit tests failed.');
    process.exit(1);
  } else {
    console.log('🎉 All Retrieval and Guardrail unit tests passed successfully!\n');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
