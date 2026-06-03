import fs from 'fs';

let et = fs.readFileSync('src/pages/EmailTemplatesPage.tsx', 'utf8');
et = et.replace(/import \{.*\} from 'firebase\/firestore';/g, '');

const loadTemplatesOld = et.indexOf('const settingsDoc = await getDoc');
if (loadTemplatesOld !== -1) {
    // we already replaced loadTemplates but maybe there is old code?
}
// lets just do a clean replace for the whole loadTemplates function.
const start = et.indexOf('const loadTemplates = async');
const end = et.indexOf('const handleSaveTemplates = async', start);

if (start !== -1 && end !== -1) {
    et = et.substring(0, start) + `const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await api.get('/settings');
      if (res.data && res.data.emailTemplates) {
         setEmailTemplates(res.data.emailTemplates);
      }
    } catch (err: any) {
      toast.error('Failed to load templates: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  ` + et.substring(end);
}

fs.writeFileSync('src/pages/EmailTemplatesPage.tsx', et);
