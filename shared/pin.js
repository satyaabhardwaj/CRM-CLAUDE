// PIN code to state and city.
//   The state is read from the first digits of the PIN, on the spot, with no internet needed.
//   The city (district) is asked from India Post's public PIN service when the internet allows it.
//   Only the six digits are sent, nothing about the client. If it cannot be reached, the city is typed by hand.
(function () {
  const THREE = { 160: 'Chandigarh', 194: 'Ladakh', 396: 'Dadra and Nagar Haveli and Daman and Diu', 403: 'Goa', 605: 'Puducherry', 682: 'Kerala', 737: 'Sikkim', 744: 'Andaman and Nicobar Islands',
    790: 'Arunachal Pradesh', 791: 'Arunachal Pradesh', 792: 'Arunachal Pradesh', 793: 'Meghalaya', 794: 'Meghalaya', 795: 'Manipur', 796: 'Mizoram', 797: 'Nagaland', 798: 'Nagaland', 799: 'Tripura',
    244: 'Uttar Pradesh', 246: 'Uttarakhand', 247: 'Uttarakhand', 248: 'Uttarakhand', 249: 'Uttarakhand', 262: 'Uttarakhand', 263: 'Uttarakhand',
    814: 'Jharkhand', 815: 'Jharkhand', 816: 'Jharkhand', 822: 'Jharkhand', 825: 'Jharkhand', 826: 'Jharkhand', 827: 'Jharkhand', 828: 'Jharkhand', 829: 'Jharkhand', 831: 'Jharkhand', 832: 'Jharkhand', 833: 'Jharkhand', 834: 'Jharkhand', 835: 'Jharkhand' };
  const TWO = { 11: 'Delhi', 12: 'Haryana', 13: 'Haryana', 14: 'Punjab', 15: 'Punjab', 16: 'Punjab', 17: 'Himachal Pradesh', 18: 'Jammu and Kashmir', 19: 'Jammu and Kashmir',
    20: 'Uttar Pradesh', 21: 'Uttar Pradesh', 22: 'Uttar Pradesh', 23: 'Uttar Pradesh', 24: 'Uttar Pradesh', 25: 'Uttar Pradesh', 26: 'Uttar Pradesh', 27: 'Uttar Pradesh', 28: 'Uttar Pradesh',
    30: 'Rajasthan', 31: 'Rajasthan', 32: 'Rajasthan', 33: 'Rajasthan', 34: 'Rajasthan', 36: 'Gujarat', 37: 'Gujarat', 38: 'Gujarat', 39: 'Gujarat',
    40: 'Maharashtra', 41: 'Maharashtra', 42: 'Maharashtra', 43: 'Maharashtra', 44: 'Maharashtra', 45: 'Madhya Pradesh', 46: 'Madhya Pradesh', 47: 'Madhya Pradesh', 48: 'Madhya Pradesh', 49: 'Chhattisgarh',
    50: 'Telangana', 51: 'Andhra Pradesh', 52: 'Andhra Pradesh', 53: 'Andhra Pradesh', 56: 'Karnataka', 57: 'Karnataka', 58: 'Karnataka', 59: 'Karnataka',
    60: 'Tamil Nadu', 61: 'Tamil Nadu', 62: 'Tamil Nadu', 63: 'Tamil Nadu', 64: 'Tamil Nadu', 67: 'Kerala', 68: 'Kerala', 69: 'Kerala',
    70: 'West Bengal', 71: 'West Bengal', 72: 'West Bengal', 73: 'West Bengal', 74: 'West Bengal', 75: 'Odisha', 76: 'Odisha', 77: 'Odisha', 78: 'Assam',
    80: 'Bihar', 81: 'Bihar', 82: 'Bihar', 83: 'Jharkhand', 84: 'Bihar', 85: 'Bihar' };
  window.Pin = {
    ok: function (pin) { return /^[1-9][0-9]{5}$/.test(String(pin || '').trim()); },
    state: function (pin) { const p = String(pin || '').trim(); return THREE[p.slice(0, 3)] || TWO[p.slice(0, 2)] || ''; },
    // Resolves { city, state } or null. Never rejects.
    lookup: function (pin) {
      if (!window.Pin.ok(pin)) return Promise.resolve(null);
      const ask = fetch('https://api.postalpincode.in/pincode/' + String(pin).trim()).then(function (r) { return r.json(); }).then(function (out) {
        const hit = out && out[0] && out[0].Status === 'Success' && out[0].PostOffice && out[0].PostOffice[0];
        return hit ? { city: hit.District || hit.Block || hit.Name || '', state: hit.State || '' } : null;
      });
      const giveUp = new Promise(function (done) { setTimeout(function () { done(null); }, 6000); });
      return Promise.race([ask, giveUp]).catch(function () { return null; });
    }
  };
})();
