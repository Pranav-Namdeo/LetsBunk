require('dotenv').config();
const mongoose = require('mongoose');

const MISSING = [
  {e:'0246AL221069',n:'VAIBHAV VISHWAKARMA'},
  {e:'0246AL231010',n:'AKSHAY PARMAR'},
  {e:'0246AL231017',n:'ANKIT UPADHYAY'},
  {e:'0246AL231059',n:'MINAKSHI ARSE'},
  {e:'0246AL241006',n:'ABHISHEK SHARMA'},
  {e:'0246AL241015',n:'AKASH DIGARSE'},
  {e:'0246AL241017',n:'AKSHAT SARAF'},
  {e:'0246AL241022',n:'AMIT CHAKRAVARTY'},
  {e:'0246AL241046',n:'ASHISH CHOUDHARI'},
  {e:'0246AL241066',n:'DHANANJAY DUBEY'},
  {e:'0246AL241069',n:'DIVYA SHUKLA'},
  {e:'0246AL241077',n:'HARSH ASHAR'},
  {e:'0246AL241084',n:'HARSHAL JAIN'},
  {e:'0246AL241091',n:'JAYDEEP RAHANGDALE'},
  {e:'0246AL241100',n:'KOUSHIK MEHRA'},
  {e:'0246AL241109',n:'MAYANK KUMAR UPADHYAY'},
  {e:'0246AL241119',n:'NILESH KOSHTA'},
  {e:'0246AL241140',n:'PUSHKAR CHOUKSEY'},
  {e:'0246AL241147',n:'RISHIKANT PATEL'},
  {e:'0246AL241150',n:'ROHIT GUPTA'},
  {e:'0246AL241151',n:'ROHIT SINGH'},
  {e:'0246AL241157',n:'SAHIL SAHU'},
  {e:'0246AL241159',n:'SAJAG GARG'},
  {e:'0246AL241175',n:'SHIVAM PANDEY'},
  {e:'0246AL241176',n:'SHIVANA GAUTAM'},
  {e:'0246AL241179',n:'SHIVENDRA SHAU'},
  {e:'0246AL241190',n:'SHRIKANT SHRIVAS'},
  {e:'0246AL241192',n:'SHWETA HARSHINI RAJAK'},
  {e:'0246AL241200',n:'SOURABH PATEL'},
  {e:'0246AL241205',n:'SWASTIK SURYAVANSHI'},
  {e:'0246AL241207',n:'TAHSEEN FATIMA'},
  {e:'0246AL241214',n:'TRISHA SAHU'},
  {e:'0246AL241215',n:'TUSHAR PARIA'},
  {e:'0246AL241219',n:'VEDANSH TIWARI'},
  {e:'0246AL241224',n:'VIJAY PATEL'},
  {e:'0246AL241230',n:'YASH JAIN'},
  {e:'0246AL241233',n:'YASHRAJ ARYA'},
  {e:'0246AL253D01',n:'TANISHKA CHOUDHRY'},
  {e:'0246CS221084',n:'HARLEEN SINGH KALSI'},
  {e:'0246CS221112',n:'KUNAL GAJABE'},
  {e:'0246CS231085',n:'DIVYANSHI TADSE'},
  {e:'0246CS231226',n:'VAIBHAV TIWARI'},
  {e:'0246CS241001',n:'AADARSH SHARMA'},
  {e:'0246CS241008',n:'ABHAY GIRI GOSWAMI'},
  {e:'0246CS241012',n:'ABHISHEK CHOUDHARI'},
  {e:'0246CS241023',n:'ADITYA CHOUDHARI'},
  {e:'0246CS241027',n:'ADITYA PANDEY'},
  {e:'0246CS241029',n:'ADITYA RATHORE'},
  {e:'0246CS241032',n:'AJAY GOUND'},
  {e:'0246CS241035',n:'AKRITI VERMA'},
  {e:'0246CS241043',n:'ANAMIKA WARKADE'},
  {e:'0246CS241044',n:'ANANT YADAV'},
  {e:'0246CS241048',n:'ANIKET GUPTA'},
  {e:'0246CS241092',n:'AYUSH SINGH'},
  {e:'0246CS241102',n:'CHAITANYA BHARDWAJ'},
  {e:'0246CS241110',n:'DEVANSH PATEL'},
  {e:'0246CS241141',n:'ISHIKA JATAV'},
  {e:'0246CS241144',n:'ISHWIN KAUR AHUJA'},
  {e:'0246CS241152',n:'JAZA BUX'},
  {e:'0246CS241161',n:'KARUN RAJAK'},
  {e:'0246CS241169',n:'KHUSHBU VERMA'},
  {e:'0246CS241182',n:'MAHI SAVLA'},
  {e:'0246CS241188',n:'MAYANK JAIN'},
  {e:'0246CS241211',n:'NITESH DWIVEDI'},
  {e:'0246CS241231',n:'PIYUSH MISHRA'},
  {e:'0246CS241243',n:'PRASHANT SHAH THAKUR'},
  {e:'0246CS241246',n:'PRATIKSHA DHAKAD'},
  {e:'0246CS241274',n:'RIYA JATAV'},
  {e:'0246CS241277',n:'SACHIN CHOURASIYA'},
  {e:'0246CS241282',n:'SAKSHI SEN'},
  {e:'0246CS241285',n:'SANJANA CHOUDHARY'},
  {e:'0246CS241296',n:'SHAKSHI CHOUDHARY'},
  {e:'0246CS241299',n:'SHARSTI GUPTA'},
  {e:'0246CS241301',n:'SHAURYA DUBEY'},
  {e:'0246CS241302',n:'SHIV KUMAR PRAJAPATI'},
  {e:'0246CS241307',n:'SHOURYA PATEL'},
  {e:'0246CS241317',n:'SHUBH DUBEY'},
  {e:'0246CS241318',n:'SHUBH GUPTA'},
  {e:'0246CS241319',n:'SHUBH JAIN'},
  {e:'0246CS241320',n:'SHUBHAM AHIRWAR'},
  {e:'0246CS241324',n:'SIDDHARTH PATEL'},
  {e:'0246CS241328',n:'SOM CHANDRA RAI'},
  {e:'0246CS241337',n:'SURAJ KUSHWAHA'},
  {e:'0246CS241346',n:'TARANG RAGHUWANSHI'},
  {e:'0246CS241354',n:'UTKARSH SEN'},
  {e:'0246CS241355',n:'UTKARSH TIWARI'},
  {e:'0246CS241375',n:'VINAY SONI'},
  {e:'0246CS241377',n:'VINAYAK SHUKLA'},
  {e:'0246CS253D04',n:'ANURAG PANDAY'},
  {e:'0246CS253D05',n:'BHANU PRATAP KUSHRAM'},
  {e:'0246CS253D08',n:'ROUNAK JAISWAL'},
  {e:'0246CS253D09',n:'SHIVANSH PATHAK'},
  {e:'0246CS253D10',n:'SOOFIYA NAAZ ANSARI'},
  {e:'0246CS253D11',n:'VEDANT PATEL'}
];

// Build email: firstname_lowercase + "." + code+seq lowercase + "@global.org.in"
// e.g. "ABHISHEK SHARMA" + "0246AL241006" -> "abhishek.al241006@global.org.in"
function makeEmail(name, enrollmentNo) {
  const firstName = name.split(' ')[0].toLowerCase();
  // extract everything after "0246" -> "AL241006" -> lowercase -> "al241006"
  const suffix = enrollmentNo.replace(/^0246/i, '').toLowerCase();
  return firstName + '.' + suffix + '@global.org.in';
}

function inferBranch(enrollmentNo) {
  if (/^0246AL/i.test(enrollmentNo)) return 'AiMl';
  if (/^0246CS/i.test(enrollmentNo)) return 'Computer Science';
  return 'Unknown';
}

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection('studentmanagements');
  const dob = new Date('2000-01-01');
  const now = new Date();
  let ok = 0, dup = 0, err = 0;

  for (const s of MISSING) {
    const branch   = inferBranch(s.e);
    const semester = '4';
    const email    = makeEmail(s.n, s.e);
    const password = s.e; // plain enrollmentNo, matching existing convention

    const doc = {
      enrollmentNo: s.e,
      name:         s.n,
      email,
      password,
      branch,
      semester,
      dob,
      phone:          '',
      photoUrl:       null,
      faceEmbedding:  null,
      faceEnrolledAt: null,
      isActive:       true,
      status:         'absent',
      lastUpdated:    now,
      createdAt:      now,
      attendanceSession: {
        totalAttendedSeconds: 0,
        isRunning:   false,
        isPaused:    false,
        status:      'absent'
      },
      attendanceBackup: [],
      __v: 0
    };

    try {
      await col.insertOne(doc);
      console.log('  OK  ' + s.e + '  ' + s.n);
      ok++;
    } catch (ex) {
      if (ex.code === 11000) { console.log('  DUP ' + s.e); dup++; }
      else { console.error('  ERR ' + s.e + ' ' + ex.message); err++; }
    }
  }

  console.log('\n--- DONE ---');
  console.log('Inserted : ' + ok);
  console.log('Duplicate: ' + dup);
  console.log('Errors   : ' + err);
  await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
