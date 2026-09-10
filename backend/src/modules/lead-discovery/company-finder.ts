export interface CompanyTarget {
  name: string;
  domain: string;
  industry: string;
  location: string;
  companyType: string;
}

export interface CompanyFinderQuery {
  location?: string;
  profession?: string;
  keywords?: string;
  companyType?: string;
  targetCount?: number;
}

// Curated seed database of legitimate tech/enterprise/agency company patterns & domains
const SAMPLE_COMPANIES: Array<{ name: string; domain: string; industry: string; location: string; type: string }> = [
  { name: "Infosys", domain: "infosys.com", industry: "IT Services", location: "India", type: "IT" },
  { name: "Wipro", domain: "wipro.com", industry: "IT Services", location: "India", type: "IT" },
  { name: "Tata Consultancy Services", domain: "tcs.com", industry: "IT Services", location: "India", type: "IT" },
  { name: "HCLTech", domain: "hcltech.com", industry: "IT Services", location: "India", type: "IT" },
  { name: "Tech Mahindra", domain: "techmahindra.com", industry: "IT Services", location: "India", type: "IT" },
  { name: "Zoho Corporation", domain: "zohocorp.com", industry: "Software", location: "India", type: "IT" },
  { name: "Freshworks", domain: "freshworks.com", industry: "Software", location: "India", type: "IT" },
  { name: "Postman", domain: "postman.com", industry: "Software", location: "India", type: "IT" },
  { name: "Razorpay", domain: "razorpay.com", industry: "Fintech", location: "India", type: "Finance" },
  { name: "Zerodha", domain: "zerodha.com", industry: "Fintech", location: "India", type: "Finance" },
  { name: "CRED", domain: "cred.club", industry: "Fintech", location: "India", type: "Finance" },
  { name: "Groww", domain: "groww.in", industry: "Fintech", location: "India", type: "Finance" },
  { name: "Pine Labs", domain: "pinelabs.com", industry: "Fintech", location: "India", type: "Finance" },
  { name: "KPMG India", domain: "kpmg.com", industry: "Accounting & Consulting", location: "India", type: "Accounts" },
  { name: "Deloitte India", domain: "deloitte.com", industry: "Accounting & Consulting", location: "India", type: "Accounts" },
  { name: "PwC India", domain: "pwc.in", industry: "Accounting & Consulting", location: "India", type: "Accounts" },
  { name: "EY India", domain: "ey.com", industry: "Accounting & Consulting", location: "India", type: "Accounts" },
  { name: "Grant Thornton", domain: "grantthornton.in", industry: "Accounting", location: "India", type: "Accounts" },
  { name: "BDO India", domain: "bdo.in", industry: "Accounting", location: "India", type: "Accounts" },
  { name: "Practo", domain: "practo.com", industry: "Healthcare", location: "India", type: "Healthcare" },
  { name: "PharmEasy", domain: "pharmeasy.in", industry: "Healthcare", location: "India", type: "Healthcare" },
  { name: "1mg", domain: "1mg.com", industry: "Healthcare", location: "India", type: "Healthcare" },
  { name: "Byju's", domain: "byjus.com", industry: "Education", location: "India", type: "Education" },
  { name: "Unacademy", domain: "unacademy.com", industry: "Education", location: "India", type: "Education" },
  { name: "upGrad", domain: "upgrad.com", industry: "Education", location: "India", type: "Education" },
  { name: "Swiggy", domain: "swiggy.com", industry: "Consumer Tech", location: "India", type: "IT" },
  { name: "Zomato", domain: "zomato.com", industry: "Consumer Tech", location: "India", type: "IT" },
  { name: "Nykaa", domain: "nykaa.com", industry: "E-Commerce", location: "India", type: "Marketing" },
  { name: "Meesho", domain: "meesho.io", industry: "E-Commerce", location: "India", type: "IT" },
  { name: "InMobi", domain: "inmobi.com", industry: "AdTech", location: "India", type: "Marketing" },
  { name: "BrowserStack", domain: "browserstack.com", industry: "Developer Tools", location: "India", type: "IT" },
  { name: "Hasura", domain: "hasura.io", industry: "Developer Tools", location: "India", type: "IT" },
  { name: "CleverTap", domain: "clevertap.com", industry: "Marketing Tech", location: "India", type: "Marketing" },
  { name: "MoEngage", domain: "moengage.com", industry: "Marketing Tech", location: "India", type: "Marketing" },
  { name: "Chargebee", domain: "chargebee.com", industry: "Fintech", location: "India", type: "Finance" },
  { name: "Lenskart", domain: "lenskart.com", industry: "Retail Tech", location: "India", type: "IT" },
  { name: "Ola", domain: "olacabs.com", industry: "Mobility", location: "India", type: "IT" },
  { name: "Dream11", domain: "dreamsports.group", industry: "Gaming", location: "India", type: "IT" },
  { name: "Delhivery", domain: "delhivery.com", industry: "Logistics Tech", location: "India", type: "IT" },
  { name: "Shadowfax", domain: "shadowfax.in", industry: "Logistics", location: "India", type: "IT" },
];

export class CompanyFinder {
  /**
   * Discovers matching companies based on user filter parameters.
   */
  async findCompanies(query: CompanyFinderQuery): Promise<CompanyTarget[]> {
    const loc = (query.location || "").toLowerCase().trim();
    const type = (query.companyType || "").toLowerCase().trim();
    const kw = (query.keywords || "").toLowerCase().trim();
    const prof = (query.profession || "").toLowerCase().trim();
    const limit = query.targetCount || 50;

    let filtered = SAMPLE_COMPANIES.filter((c) => {
      let matches = true;

      if (type && type !== "all" && type !== "other") {
        matches = matches && c.type.toLowerCase() === type;
      }

      if (loc) {
        matches = matches && (c.location.toLowerCase().includes(loc) || loc.includes(c.location.toLowerCase()));
      }

      if (kw) {
        matches =
          matches &&
          (c.name.toLowerCase().includes(kw) ||
            c.industry.toLowerCase().includes(kw) ||
            c.type.toLowerCase().includes(kw));
      }

      if (prof) {
        matches =
          matches &&
          (c.type.toLowerCase().includes(prof) ||
            c.industry.toLowerCase().includes(prof) ||
            prof.includes(c.type.toLowerCase()));
      }

      return matches;
    });

    // If filter is too restrictive, fallback to closest matches or general companies in that type/location
    if (filtered.length < Math.min(10, limit)) {
      const fallback = SAMPLE_COMPANIES.filter((c) => {
        if (type && type !== "all") {
          return c.type.toLowerCase() === type;
        }
        return true;
      });
      const existingDomains = new Set(filtered.map((f) => f.domain));
      for (const item of fallback) {
        if (!existingDomains.has(item.domain)) {
          filtered.push(item);
          existingDomains.add(item.domain);
        }
      }
    }

    return filtered.slice(0, Math.max(10, limit)).map((c) => ({
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      location: c.location,
      companyType: c.type,
    }));
  }
}

export const companyFinder = new CompanyFinder();
