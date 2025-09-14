#!/usr/bin/env python3
"""
SMS Helper using AccountGeneratorHelper library
Integrates with the Node.js project for SMS verification
"""

from account_generator_helper import ReceiveSms, Counties
import sys
import json
import time

def receive_sms(phone_number, country='IN', timeout=300):
    """
    Receive SMS for a given phone number using AccountGeneratorHelper

    Args:
        phone_number (str): Phone number to receive SMS (e.g., '+918008272769')
        country (str): Country code (default 'IN' for India)
        timeout (int): Timeout in seconds (default 300)

    Returns:
        dict: {'success': bool, 'code': str or None, 'error': str or None}
    """
    try:
        # Initialize SMS receiver
        sms = ReceiveSms()

        # Map country string to Counties enum
        country_map = {
            'IN': Counties.INDIA,
            'US': Counties.USA,
            'RU': Counties.RUSSIA,
            # Add more as needed
        }

        country_enum = country_map.get(country.upper(), Counties.INDIA)

        print(f"Waiting for SMS on {phone_number} (country: {country})...", file=sys.stderr)

        # Wait for SMS
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                # Get SMS messages
                messages = sms.get_sms(phone_number, country_enum)

                if messages:
                    for message in messages:
                        # Extract code (assuming 4-8 digit code)
                        import re
                        code_match = re.search(r'\b(\d{4,8})\b', message.get('text', ''))
                        if code_match:
                            return {
                                'success': True,
                                'code': code_match.group(1),
                                'error': None
                            }

                time.sleep(5)  # Poll every 5 seconds

            except Exception as e:
                print(f"Error polling SMS: {e}", file=sys.stderr)
                time.sleep(5)

        return {
            'success': False,
            'code': None,
            'error': 'Timeout waiting for SMS'
        }

    except Exception as e:
        return {
            'success': False,
            'code': None,
            'error': str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sms_helper.py <phone_number> [country] [timeout]", file=sys.stderr)
        sys.exit(1)

    phone = sys.argv[1]
    country = sys.argv[2] if len(sys.argv) > 2 else 'IN'
    timeout = int(sys.argv[3]) if len(sys.argv) > 3 else 300

    result = receive_sms(phone, country, timeout)
    print(json.dumps(result))