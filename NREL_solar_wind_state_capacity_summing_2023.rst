import pandas as pd

# where to find the files - in this case, the same directory as this file
root_dir = ""

# ------------------------------

# 2023 REPORT DATA

# NOTE: this will differ from the NREL vis capacity output (reference), appears to be due to
# their not multiplying by cf in order to accurately display how many energy production
# mechanisms need buying rather than how much will be produced

# will crunch the NREL files to sum the capacity for each state for each file type
# factoring in capacity factor; as well as rename Rhode Island & convert MW -> GWh

# file names
solar_open_big_name = "solar_open_capacity_2023_NREL.csv"
solar_reference_big_name = "solar_reference_capacity_2023_NREL.csv"
solar_limited_big_name = "solar_limited_capacity_2023_NREL.csv"
wind_open_big_name = "wind_open_capacity_2023_NREL.csv"
wind_reference_big_name = "wind_reference_capacity_2023_NREL.csv"
wind_limited_big_name = "wind_limited_capacity_2023_NREL.csv"

solar_open_condensed_name = "solar_open_capacity_2023_NREL_condensed.csv"
solar_reference_condensed_name = "solar_reference_capacity_2023_NREL_condensed.csv"
solar_limited_condensed_name = "solar_limited_capacity_2023_NREL_condensed.csv"
wind_open_condensed_name = "wind_open_capacity_2023_NREL_condensed.csv"
wind_reference_condensed_name = "wind_reference_capacity_2023_NREL_condensed.csv"
wind_limited_condensed_name = "wind_limited_capacity_2023_NREL_condensed.csv"

# read CSVs
solar_open_big = pd.read_csv(root_dir + solar_open_big_name)
solar_reference_big = pd.read_csv(root_dir + solar_reference_big_name)
solar_limited_big = pd.read_csv(root_dir + solar_limited_big_name)
wind_open_big = pd.read_csv(root_dir + wind_open_big_name)
wind_reference_big = pd.read_csv(root_dir + wind_reference_big_name)
wind_limited_big = pd.read_csv(root_dir + wind_limited_big_name)

big_arr = [solar_open_big, solar_reference_big, solar_limited_big,
          wind_open_big, wind_reference_big, wind_limited_big]

# visually verify CSVs (column headers & amount of columns)
print("Big:")
for b in big_arr:
    display(b)

# make dictionaries (to later convert to DataFrames, then to Excel files)
# to compile state sums
solar_open_condensed_d = dict()
solar_reference_condensed_d = dict()
solar_limited_condensed_d = dict()
wind_open_condensed_d = dict()
wind_reference_condensed_d = dict()
wind_limited_condensed_d = dict()

# same order as big_arr
condensed_d_arr = [solar_open_condensed_d, solar_reference_condensed_d, solar_limited_condensed_d,
                wind_open_condensed_d, wind_reference_condensed_d, wind_limited_condensed_d]

# loop over files to condense
for i in range(0,6):
    # loop over columns in big file
    curr_big = big_arr[i]
    curr_condensed_d = condensed_d_arr[i]
    curr_rows = curr_big.shape[0]
    # visually verify curr_rows
    print(curr_rows)
    
    for j in range(0, curr_rows):
        curr_state = curr_big.at[j, 'state']
        if(curr_state == "Rhode Island and Providence Plantations"): # rename Rhode Island to match with our JS code
            curr_state = "Rhode Island"
        
        curr_capacity = None
        if(i <= 2): # solar
            curr_capacity = curr_big.at[j, 'capacity_mw_ac'] * curr_big.at[j, 'mean_cf_ac']
        else: # wind
            curr_capacity = curr_big.at[j, 'capacity_mw'] * curr_big.at[j, 'mean_cf']
        
        # add this capacity to the condensed output
        if curr_state in curr_condensed_d:
            curr_condensed_d[curr_state] = curr_condensed_d[curr_state] + curr_capacity
        else:
            curr_condensed_d[curr_state] = curr_capacity
            
# visually verify condensed dictionaries + print lengths
print("Condensed:")
for cd in condensed_d_arr:
    display(cd)
    print(str(len(cd)) + " rows")
    
# reformat dictionaries to prep to be made into dataframes for export
solar_open_condensed_prep = []
solar_reference_condensed_prep = []
solar_limited_condensed_prep = []
wind_open_condensed_prep = []
wind_reference_condensed_prep = []
wind_limited_condensed_prep = []

condensed_prep_arr = [solar_open_condensed_prep, solar_reference_condensed_prep, solar_limited_condensed_prep,
                     wind_open_condensed_prep, wind_reference_condensed_prep, wind_limited_condensed_prep]
for i in range(0, 6):
    curr_condensed_d = condensed_d_arr[i]
    curr_condensed_prep = condensed_prep_arr[i]
    
    for k in curr_condensed_d.keys():
        curr_to_gwh = curr_condensed_d[k] * 0.001 * 365 * 24 # convert to GWh for consistency with JS file
        curr_two = [k, curr_to_gwh]
        curr_condensed_prep.append(curr_two)

# visually verify condensed prep arrays
print("Condensed prep:")
for cpr in condensed_prep_arr:
    display(cpr)
    
# convert arrays to dataframes
solar_open_condensed_df = pd.DataFrame(solar_open_condensed_prep, columns=["state", "capacity_gwh"])
solar_reference_condensed_df = pd.DataFrame(solar_reference_condensed_prep, columns=["state", "capacity_gwh"])
solar_limited_condensed_df = pd.DataFrame(solar_limited_condensed_prep, columns=["state", "capacity_gwh"])
wind_open_condensed_df = pd.DataFrame(wind_open_condensed_prep, columns=["state", "capacity_gwh"])
wind_reference_condensed_df = pd.DataFrame(wind_reference_condensed_prep, columns=["state", "capacity_gwh"])
wind_limited_condensed_df = pd.DataFrame(wind_limited_condensed_prep, columns=["state", "capacity_gwh"])

# convert dataframes to exported csv files into our root dir (uncomment to modify local files aka export)
#solar_open_condensed_df.to_csv(root_dir + solar_open_condensed_name, header=True)
#solar_reference_condensed_df.to_csv(root_dir + solar_reference_condensed_name, header=True)
#solar_limited_condensed_df.to_csv(root_dir + solar_limited_condensed_name, header=True)
#wind_open_condensed_df.to_csv(root_dir + wind_open_condensed_name, header=True)
#wind_reference_condensed_df.to_csv(root_dir + wind_reference_condensed_name, header=True)
#wind_limited_condensed_df.to_csv(root_dir + wind_limited_condensed_name, header=True)

# check files in your dir & verify values and row count against the printed ones
print("Done! Not printed to file (commented out)")

# ------------------------------
# 2021 OFFSHORE WIND DATA
# (is not split by state in file)

# WHOLE SUM
# summing just the offshore wind files; not currently in the stock of those loaded & displayed in the vis
offshore_wind_open_big_name = "offshore_wind_open_capacity_2021_NREL.csv"
offshore_wind_limited_big_name = "offshore_wind_limited_capacity_2021_NREL.csv"

offshore_wind_condensed_name = "offshore_wind_capacity_2021_NREL_condensed.csv" # it'll be 2 numbers, both go into 1 file

offshore_wind_open_big = pd.read_csv(root_dir + offshore_wind_open_big_name);
offshore_wind_limited_big = pd.read_csv(root_dir + offshore_wind_limited_big_name);

# vis verify
display(offshore_wind_open_big)
display(offshore_wind_limited_big)

# going to take into account capacity factor of each row & conversion
offshore_wind_open_sum_gwh = 0;
offshore_wind_limited_sum_gwh = 0;

owo_rows = offshore_wind_open_big.shape[0]
owl_rows = offshore_wind_limited_big.shape[0]

# vis verify
print(str(owo_rows) + " rows in open")
print(str(owl_rows) + " rows in limited")

for r in range(0, owo_rows):
    curr_capacity = offshore_wind_open_big.at[r, "capacity_mw"]
    curr_cf = offshore_wind_open_big.at[r, "capacity_factor"]
    
    curr_val = curr_capacity * curr_cf * 0.001 * 365 * 24 # to GWh
    
    offshore_wind_open_sum_gwh += curr_val;
    
for r in range(0, owl_rows):
    curr_capacity = offshore_wind_limited_big.at[r, "capacity_mw"]
    curr_cf = offshore_wind_limited_big.at[r, "capacity_factor"]
    
    curr_val = curr_capacity * curr_cf * 0.001 * 365 * 24 # to GWh
    
    offshore_wind_limited_sum_gwh += curr_val;
    
# vis verify
print("2021 US offshore wind open capacity: " + str(offshore_wind_open_sum_gwh) + " GWh")
print("2021 US offshore wind limited capacity: " + str(offshore_wind_limited_sum_gwh) + " GWh")

offshore_wind_condensed_prep = []
offshore_wind_condensed_prep.append(["open", offshore_wind_open_sum_gwh])
offshore_wind_condensed_prep.append(["limited", offshore_wind_limited_sum_gwh])

# vis verify
display(offshore_wind_condensed_prep)

# convert to df & export (uncomment to modify local files aka export)
offshore_wind_condensed_df = pd.DataFrame(offshore_wind_condensed_prep, columns=["type", "capacity_gwh_us"])
#offshore_wind_condensed_df.to_csv(root_dir + offshore_wind_condensed_name, header=True)

print("Done! Not printed to file (commented out)")

# ------------------------------

# TEST: SPLITTING LONGITUDES
split_at_long = -100; # atlantic + gulf vs pacific
split_gulf_at_long = -81.5; # gulf of mexico vs atlantic

offshore_wind_open_atlantic_sum_gwh = 0;
offshore_wind_open_pacific_sum_gwh = 0;
offshore_wind_open_gulf_sum_gwh = 0;

offshore_wind_limited_atlantic_sum_gwh = 0;
offshore_wind_limited_pacific_sum_gwh = 0;
offshore_wind_limited_gulf_sum_gwh = 0;

for r in range(0, owo_rows):
    curr_capacity = offshore_wind_open_big.at[r, "capacity_mw"]
    curr_cf = offshore_wind_open_big.at[r, "capacity_factor"]
    curr_long = offshore_wind_open_big.at[r, "longitude"]
    
    curr_val = curr_capacity * curr_cf * 0.001 * 365 * 24 # to GWh
    
    if(curr_long > split_gulf_at_long):
        offshore_wind_open_atlantic_sum_gwh += curr_val;
    elif(curr_long > split_at_long):
        offshore_wind_open_gulf_sum_gwh += curr_val;
    else:
        offshore_wind_open_pacific_sum_gwh += curr_val;
        
for r in range(0, owl_rows):
    curr_capacity = offshore_wind_limited_big.at[r, "capacity_mw"]
    curr_cf = offshore_wind_limited_big.at[r, "capacity_factor"]
    curr_long = offshore_wind_limited_big.at[r, "longitude"]
    
    curr_val = curr_capacity * curr_cf * 0.001 * 365 * 24 # to GWh
    
    if(curr_long > split_gulf_at_long):
        offshore_wind_limited_atlantic_sum_gwh += curr_val;
    elif(curr_long > split_at_long):
        offshore_wind_limited_gulf_sum_gwh += curr_val;
    else:
        offshore_wind_limited_pacific_sum_gwh += curr_val;

print("")
print("TEST: offshore wind open atlantic sum: " + str(offshore_wind_open_atlantic_sum_gwh) + " GWh")
print("TEST: offshore wind open gulf sum: " + str(offshore_wind_open_gulf_sum_gwh) + " GWh")
print("TEST: offshore wind open pacific sum: " + str(offshore_wind_open_pacific_sum_gwh) + " GWh")
print("")
print("TEST: offshore wind limited atlantic sum: " + str(offshore_wind_limited_atlantic_sum_gwh) + " GWh")
print("TEST: offshore wind limited gulf sum: " + str(offshore_wind_limited_gulf_sum_gwh) + " GWh")
print("TEST: offshore wind limited pacific sum: " + str(offshore_wind_limited_pacific_sum_gwh) + " GWh")

